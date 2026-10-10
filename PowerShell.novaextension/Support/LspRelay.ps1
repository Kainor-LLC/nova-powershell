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
    public static int Run(string socketPath)
    {
        var socket = new Socket(AddressFamily.Unix, SocketType.Stream, ProtocolType.Unspecified);
        socket.Connect(new UnixDomainSocketEndPoint(socketPath));
        var server = new NetworkStream(socket, true);
        var stdin = Console.OpenStandardInput();
        var stdout = Console.OpenStandardOutput();

        var done = new ManualResetEventSlim(false);
        new Thread(() => { try { RelayClientFrames(stdin, server); } catch { } finally { done.Set(); } }) { IsBackground = true }.Start();
        new Thread(() => { try { Copy(server, stdout); } catch { } finally { done.Set(); } }) { IsBackground = true }.Start();
        done.Wait();
        try { server.Dispose(); } catch { }
        return 0;
    }

    // Forwards Nova's messages frame by frame. PSES takes many seconds to close its socket
    // after the LSP "exit" notification, so the relay forwards "exit" and then returns,
    // letting the bridge stop PSES right away.
    static void RelayClientFrames(Stream client, Stream server)
    {
        while (true)
        {
            int length = ReadContentLength(client);
            if (length < 0)
            {
                return;
            }
            byte[] body = ReadExactly(client, length);
            byte[] header = Encoding.ASCII.GetBytes("Content-Length: " + body.Length + "\r\n\r\n");
            server.Write(header, 0, header.Length);
            server.Write(body, 0, body.Length);
            server.Flush();
            if (IsExitNotification(body))
            {
                return;
            }
        }
    }

    static bool IsExitNotification(byte[] body)
    {
        try
        {
            using (var document = JsonDocument.Parse(body))
            {
                JsonElement method;
                return document.RootElement.TryGetProperty("method", out method) && method.GetString() == "exit";
            }
        }
        catch
        {
            return false;
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

    static void Copy(Stream from, Stream to)
    {
        var buffer = new byte[65536];
        int count;
        while ((count = from.Read(buffer, 0, buffer.Length)) > 0)
        {
            to.Write(buffer, 0, count);
            to.Flush();
        }
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

exit [NovaLspRelay]::Run($socketPath)
