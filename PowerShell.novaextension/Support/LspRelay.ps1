<#
.SYNOPSIS
    Relays Nova's language client (stdio) to the PowerShell Editor Services socket.
.DESCRIPTION
    Started by pses-bridge.sh. Waits for PSES to publish its session file, connects to the
    language service socket, then copies bytes in both directions. It exits as soon as
    either side closes (Nova closing stdin, or PSES closing the socket), which lets the
    bridge stop PSES right away instead of waiting for Nova's timeout.

    Inputs (environment):
      NOVA_PS_SESSION_FILE  PSES session details JSON
      NOVA_PS_CACHE_DIR     Where the compiled relay assembly is cached
      NOVA_PS_LSP_LOG       Optional file to log message methods and ids to (not contents)
#>

$ErrorActionPreference = 'Stop'

$source = @'
using System;
using System.IO;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Threading;

public static class NovaLspRelay
{
    static readonly object LogLock = new object();
    static StreamWriter _log;
    static string _shutdownId;

    static void Log(string text)
    {
        if (_log == null)
        {
            return;
        }
        lock (LogLock)
        {
            _log.WriteLine(DateTime.Now.ToString("HH:mm:ss.fff") + " " + text);
            _log.Flush();
        }
    }

    public static int Run(string socketPath, string logFile)
    {
        if (!string.IsNullOrEmpty(logFile))
        {
            _log = new StreamWriter(logFile, false, new UTF8Encoding(false));
        }
        var socket = new Socket(AddressFamily.Unix, SocketType.Stream, ProtocolType.Unspecified);
        socket.Connect(new UnixDomainSocketEndPoint(socketPath));
        var server = new NetworkStream(socket, true);
        var stdin = Console.OpenStandardInput();
        var stdout = Console.OpenStandardOutput();

        var done = new ManualResetEventSlim(false);
        new Thread(() => { try { RelayClientFrames(stdin, server); } catch (Exception e) { Log("client relay ended: " + e.Message); } finally { done.Set(); } }) { IsBackground = true }.Start();
        new Thread(() => { try { RelayServerFrames(server, stdout); } catch (Exception e) { Log("server relay ended: " + e.Message); } finally { done.Set(); } }) { IsBackground = true }.Start();
        done.Wait();
        Log("relay exiting");
        try { server.Dispose(); } catch { }
        return 0;
    }

    // Forwards Nova's messages frame by frame. PSES keeps running for many seconds after
    // the LSP "exit" notification, so the relay returns as soon as it has forwarded "exit"
    // (or seen the server answer "shutdown"), letting the bridge stop PSES right away.
    static void RelayClientFrames(Stream client, Stream server)
    {
        while (true)
        {
            int length = ReadContentLength(client);
            if (length < 0)
            {
                Log("Nova closed stdin");
                return;
            }
            byte[] body = ReadExactly(client, length);
            string method, id;
            Describe(body, out method, out id);
            Log("-> " + (method ?? "response") + (id != null ? " #" + id : ""));
            byte[] header = Encoding.ASCII.GetBytes("Content-Length: " + body.Length + "\r\n\r\n");
            server.Write(header, 0, header.Length);
            server.Write(body, 0, body.Length);
            server.Flush();
            if (method == "shutdown")
            {
                _shutdownId = id;
            }
            if (method == "exit")
            {
                Log("exit forwarded");
                return;
            }
        }
    }

    static void RelayServerFrames(Stream server, Stream client)
    {
        while (true)
        {
            int length = ReadContentLength(server);
            if (length < 0)
            {
                Log("PSES closed the socket");
                return;
            }
            byte[] body = ReadExactly(server, length);
            string method, id;
            Describe(body, out method, out id);
            Log("<- " + (method ?? "response") + (id != null ? " #" + id : ""));
            byte[] header = Encoding.ASCII.GetBytes("Content-Length: " + body.Length + "\r\n\r\n");
            client.Write(header, 0, header.Length);
            client.Write(body, 0, body.Length);
            client.Flush();
            if (method == null && id != null && id == _shutdownId)
            {
                Log("shutdown answered");
                return;
            }
        }
    }

    // Reads a message's method (null for responses) and id (null for notifications).
    static void Describe(byte[] body, out string method, out string id)
    {
        method = null;
        id = null;
        try
        {
            using (var document = JsonDocument.Parse(body))
            {
                JsonElement element;
                if (document.RootElement.TryGetProperty("method", out element))
                {
                    method = element.GetString();
                }
                if (document.RootElement.TryGetProperty("id", out element) && element.ValueKind != JsonValueKind.Null)
                {
                    id = element.ToString();
                }
            }
        }
        catch
        {
        }
    }

    static int ReadContentLength(Stream stream)
    {
        int length = -1;
        var line = new StringBuilder();
        while (true)
        {
            int b = stream.ReadByte();
            if (b < 0)
            {
                return -1;
            }
            if (b != '\n')
            {
                line.Append((char)b);
                continue;
            }
            string header = line.ToString().TrimEnd('\r');
            line.Clear();
            if (header.Length == 0)
            {
                if (length >= 0)
                {
                    return length;
                }
                continue;
            }
            int colon = header.IndexOf(':');
            if (colon > 0 && header.Substring(0, colon).Trim().Equals("Content-Length", StringComparison.OrdinalIgnoreCase))
            {
                length = int.Parse(header.Substring(colon + 1).Trim());
            }
        }
    }

    static byte[] ReadExactly(Stream stream, int count)
    {
        var buffer = new byte[count];
        int offset = 0;
        while (offset < count)
        {
            int read = stream.Read(buffer, offset, count - offset);
            if (read <= 0)
            {
                throw new EndOfStreamException();
            }
            offset += read;
        }
        return buffer;
    }

}
'@

# Load the relay, compiling it once per source version.
$cacheDir = if ($env:NOVA_PS_CACHE_DIR) { $env:NOVA_PS_CACHE_DIR } else { [IO.Path]::GetTempPath() }
$null = New-Item -ItemType Directory -Path $cacheDir -Force
$hash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($source + $PSVersionTable.PSVersion))).Substring(0, 12)
$assembly = Join-Path $cacheDir "NovaLspRelay-$hash.dll"
if (-not (Test-Path -LiteralPath $assembly)) {
    Add-Type -TypeDefinition $source -OutputAssembly $assembly -OutputType Library
}
Add-Type -LiteralPath $assembly

# Wait for PSES to publish its language service socket (up to 60 seconds).
$sessionFile = $env:NOVA_PS_SESSION_FILE
$socketPath = $null
for ($i = 0; $i -lt 600; $i++) {
    if (Test-Path -LiteralPath $sessionFile) {
        try {
            $session = Get-Content -Raw -LiteralPath $sessionFile | ConvertFrom-Json
            if ($session.status -eq 'started' -and $session.languageServicePipeName) {
                $socketPath = $session.languageServicePipeName
                break
            }
            if ($session.status -eq 'failed') {
                [Console]::Error.WriteLine("PowerShell Editor Services failed to start: $($session.reason)")
                exit 1
            }
        }
        catch {
            # File may be mid-write.
        }
    }
    Start-Sleep -Milliseconds 100
}
if (-not $socketPath) {
    [Console]::Error.WriteLine("PowerShell Editor Services did not start within 60 seconds.")
    exit 1
}

exit [NovaLspRelay]::Run($socketPath, $env:NOVA_PS_LSP_LOG)
