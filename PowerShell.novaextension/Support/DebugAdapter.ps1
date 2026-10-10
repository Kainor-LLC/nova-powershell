<#
.SYNOPSIS
    Debug adapter relay between Nova and PowerShell Editor Services.
.DESCRIPTION
    Nova launches this script as a stdio debug adapter. It connects to the PSES debug
    service socket (listed in the session file written by pses-bridge.sh) and relays Debug
    Adapter Protocol messages in both directions.

    PSES writes the debugged script's console output to its own stdout, which the bridge
    captures in a file. This relay tails that file and forwards new text to Nova as DAP
    "output" events, flushing pending output before "stopped" and "terminated" events so
    output always appears in order.

    Inputs (environment):
      NOVA_PS_SESSION_FILE  PSES session details JSON
      NOVA_PS_OUTPUT_FILE   File receiving the PSES console output
      NOVA_PS_CACHE_DIR     Where the compiled relay assembly is cached
      NOVA_PS_DAP_LOG       Optional file to log DAP traffic to
#>

$ErrorActionPreference = 'Stop'

$source = @'
using System;
using System.IO;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Threading;

public static class NovaDapRelay
{
    static readonly object WriteLock = new object();
    static readonly object TailLock = new object();
    static readonly Regex Prompt = new Regex(@"^PS [^\r\n]*?> ", RegexOptions.Compiled);
    static Stream _out;
    static FileStream _tailStream;
    static StreamReader _tailReader;
    static readonly StringBuilder _pending = new StringBuilder();
    static readonly object LogLock = new object();
    static StreamWriter _log;

    static void Log(string direction, string text)
    {
        if (_log == null)
        {
            return;
        }
        lock (LogLock)
        {
            _log.WriteLine(DateTime.Now.ToString("HH:mm:ss.fff") + " " + direction + " " + text);
            _log.Flush();
        }
    }

    public static int Run(string socketPath, string outputFile, string logFile)
    {
        if (!string.IsNullOrEmpty(logFile))
        {
            _log = new StreamWriter(logFile, false, new UTF8Encoding(false));
        }
        var socket = new Socket(AddressFamily.Unix, SocketType.Stream, ProtocolType.Unspecified);
        socket.Connect(new UnixDomainSocketEndPoint(socketPath));
        var server = new NetworkStream(socket, true);
        var stdin = Console.OpenStandardInput();
        _out = Console.OpenStandardOutput();

        _tailStream = new FileStream(outputFile, FileMode.OpenOrCreate, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
        _tailStream.Seek(0, SeekOrigin.End);
        _tailReader = new StreamReader(_tailStream, Encoding.UTF8);

        var done = new ManualResetEventSlim(false);
        var toServer = new Thread(() =>
        {
            try { RelayClientFrames(stdin, server); } catch (Exception e) { Log("!!", "client relay: " + e.Message); }
            finally { done.Set(); }
        }) { IsBackground = true };
        var toClient = new Thread(() =>
        {
            try { RelayServerFrames(server); } catch (Exception e) { Log("!!", "server relay: " + e.Message); }
            finally { done.Set(); }
        }) { IsBackground = true };
        var tail = new Thread(() =>
        {
            while (!done.IsSet)
            {
                try { FlushOutput(false); } catch { }
                done.Wait(100);
            }
        }) { IsBackground = true };

        toServer.Start();
        toClient.Start();
        tail.Start();
        done.Wait();
        try { FlushOutput(true); } catch { }
        try { server.Dispose(); } catch { }
        return 0;
    }

    static void RelayClientFrames(Stream client, Stream server)
    {
        while (true)
        {
            int length = ReadContentLength(client);
            if (length < 0)
            {
                Log("--", "Nova closed the connection");
                return;
            }
            byte[] body = ReadExactly(client, length);
            Log("->", Encoding.UTF8.GetString(body));
            byte[] header = Encoding.ASCII.GetBytes("Content-Length: " + body.Length + "\r\n\r\n");
            server.Write(header, 0, header.Length);
            server.Write(body, 0, body.Length);
            server.Flush();
        }
    }

    static void RelayServerFrames(Stream server)
    {
        while (true)
        {
            int length = ReadContentLength(server);
            if (length < 0)
            {
                Log("--", "PSES closed the connection");
                return;
            }
            byte[] body = ReadExactly(server, length);
            string text = Encoding.UTF8.GetString(body);
            Log("<-", text);
            if (text.Contains("\"command\":\"stackTrace\""))
            {
                body = FixStackTrace(body);
            }
            if (text.Contains("\"type\":\"event\"") &&
                (text.Contains("\"event\":\"stopped\"") || text.Contains("\"event\":\"terminated\"") || text.Contains("\"event\":\"exited\"")))
            {
                // Give PSES a moment to write console output, then send it before the event.
                Thread.Sleep(50);
                FlushOutput(true);
            }
            WriteFrame(body);
        }
    }

    // PSES marks frames as presentationHint "label" (a non-selectable separator in DAP), so
    // Nova would not select the frame, jump to its line, or load its variables. Frames with a
    // source location are made normal frames, and placeholder names get the file name.
    static byte[] FixStackTrace(byte[] body)
    {
        try
        {
            var root = JsonNode.Parse(body);
            var frames = root?["body"]?["stackFrames"] as JsonArray;
            if (frames == null)
            {
                return body;
            }
            foreach (var frame in frames)
            {
                if (frame == null || frame["source"]?["path"] == null)
                {
                    continue;
                }
                if ((string)frame["presentationHint"] == "label")
                {
                    frame.AsObject().Remove("presentationHint");
                }
                string name = (string)frame["name"] ?? "";
                if (name.StartsWith("<") && name.EndsWith(">"))
                {
                    frame["name"] = Path.GetFileName((string)frame["source"]["path"]);
                }
            }
            byte[] fixedBody = Encoding.UTF8.GetBytes(root.ToJsonString());
            Log("<<", "rewrote stackTrace: " + Encoding.UTF8.GetString(fixedBody));
            return fixedBody;
        }
        catch (Exception e)
        {
            Log("!!", "could not rewrite stackTrace: " + e.Message);
            return body;
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
            if (b == '\n')
            {
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
            else
            {
                line.Append((char)b);
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

    static void WriteFrame(byte[] body)
    {
        lock (WriteLock)
        {
            byte[] header = Encoding.ASCII.GetBytes("Content-Length: " + body.Length + "\r\n\r\n");
            _out.Write(header, 0, header.Length);
            _out.Write(body, 0, body.Length);
            _out.Flush();
        }
    }

    // Sends new console output as DAP output events. Partial lines are held back unless
    // includePartial is set, so a prompt line can be recognized and dropped as a whole.
    static void FlushOutput(bool includePartial)
    {
        lock (TailLock)
        {
            string chunk = _tailReader.ReadToEnd();
            if (chunk.Length > 0)
            {
                _pending.Append(chunk);
            }
            if (_pending.Length == 0)
            {
                return;
            }

            string text = _pending.ToString();
            int lastNewline = text.LastIndexOf('\n');
            string complete = lastNewline >= 0 ? text.Substring(0, lastNewline + 1) : "";
            string partial = lastNewline >= 0 ? text.Substring(lastNewline + 1) : text;
            _pending.Clear();

            // "complete" is empty or ends with a newline, so the last split entry is always empty.
            var output = new StringBuilder();
            string[] lines = complete.Split('\n');
            for (int i = 0; i < lines.Length - 1; i++)
            {
                // Drop the PSES prompt and the echoed launch command.
                if (!Prompt.IsMatch(lines[i]))
                {
                    output.Append(lines[i].TrimEnd('\r')).Append('\n');
                }
            }

            if (includePartial)
            {
                if (!Prompt.IsMatch(partial))
                {
                    output.Append(partial);
                }
            }
            else
            {
                _pending.Append(partial);
            }

            if (output.Length > 0)
            {
                SendOutput(output.ToString());
            }
        }
    }

    static void SendOutput(string text)
    {
        var message = new
        {
            seq = 0,
            type = "event",
            @event = "output",
            body = new { category = "stdout", output = text },
        };
        WriteFrame(JsonSerializer.SerializeToUtf8Bytes(message));
    }
}
'@

function Write-AdapterError([string]$Message) {
    [Console]::Error.WriteLine("PowerShell debug adapter: $Message")
}

# Load the relay, compiling it once per source version.
$cacheDir = if ($env:NOVA_PS_CACHE_DIR) { $env:NOVA_PS_CACHE_DIR } else { [IO.Path]::GetTempPath() }
$null = New-Item -ItemType Directory -Path $cacheDir -Force
$hash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($source + $PSVersionTable.PSVersion))).Substring(0, 12)
$assembly = Join-Path $cacheDir "NovaDapRelay-$hash.dll"
if (-not (Test-Path -LiteralPath $assembly)) {
    Add-Type -TypeDefinition $source -OutputAssembly $assembly -OutputType Library
}
Add-Type -LiteralPath $assembly

# Find the debug service socket. PSES creates it once the language server has connected.
$sessionFile = $env:NOVA_PS_SESSION_FILE
$socketPath = $null
for ($i = 0; $i -lt 300; $i++) {
    if ($sessionFile -and (Test-Path -LiteralPath $sessionFile)) {
        try {
            $session = Get-Content -Raw -LiteralPath $sessionFile | ConvertFrom-Json
            if ($session.status -eq 'started' -and $session.debugServicePipeName -and (Test-Path -LiteralPath $session.debugServicePipeName)) {
                $socketPath = $session.debugServicePipeName
                break
            }
        }
        catch {
            # File may be mid-write.
        }
    }
    Start-Sleep -Milliseconds 100
}
if (-not $socketPath) {
    Write-AdapterError "The PowerShell language server is not running, so debugging is unavailable. Make sure 'Enable Language Server' is on in the extension preferences."
    exit 1
}

exit [NovaDapRelay]::Run($socketPath, $env:NOVA_PS_OUTPUT_FILE, $env:NOVA_PS_DAP_LOG)
