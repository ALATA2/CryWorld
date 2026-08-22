$port = 8000
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")

# Change directory to script location
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Host "=============================================" -ForegroundColor Green
Write-Host "   VOLCANIC ISLAND WEB SERVER ACTIVE" -ForegroundColor Green
Write-Host "   Indirizzo: http://localhost:$port/" -ForegroundColor Cyan
Write-Host "   Premi CTRL+C in questa finestra per fermarlo." -ForegroundColor Yellow
Write-Host "=============================================" -ForegroundColor Green

try {
    $listener.Start()
    
    # Auto-open browser
    Start-Process "http://localhost:$port/"
    
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        $url = $request.Url.LocalPath
        if ($url -eq "/" -or $url -eq "") { $url = "/index.html" }
        
        # Clean query parameters if any
        if ($url.Contains("?")) {
            $url = $url.Substring(0, $url.IndexOf("?"))
        }

        $filePath = Join-Path $scriptDir $url
        
        if (Test-Path $filePath -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            
            # Determine content type (crucial for ES Modules .js load)
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $contentType = switch ($ext) {
                ".html" { "text/html; charset=utf-8" }
                ".js"   { "application/javascript; charset=utf-8" }
                ".css"  { "text/css; charset=utf-8" }
                ".png"  { "image/png" }
                ".jpg"  { "image/jpeg" }
                ".jpeg" { "image/jpeg" }
                ".ico"  { "image/x-icon" }
                default { "application/octet-stream" }
            }
            
            $response.ContentType = $contentType
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            Write-Host "[200 OK] Servito: $url" -ForegroundColor DarkGreen
        } else {
            $response.StatusCode = 404
            $errorMessage = "404 - File non trovato"
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes($errorMessage)
            $response.ContentLength64 = $errBytes.Length
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
            Write-Host "[404 NOT FOUND] File mancante: $url" -ForegroundColor Red
        }
        $response.Close()
    }
} catch {
    Write-Host "Errore del server: $_" -ForegroundColor Red
} finally {
    $listener.Stop()
    Write-Host "Server spento." -ForegroundColor Yellow
}
