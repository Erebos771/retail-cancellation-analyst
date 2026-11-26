# Run the local dashboard with Node.js 20+ and a process-scoped Gemini key.
$ErrorActionPreference = 'Stop'
$prompted = -not $env:GEMINI_API_KEY
try {
    if ($prompted) {
        $secret = Read-Host 'Gemini API key' -AsSecureString
        $env:GEMINI_API_KEY = [System.Net.NetworkCredential]::new('', $secret).Password
    }
    node (Join-Path $PSScriptRoot 'server.js')
} finally {
    if ($prompted) { Remove-Item Env:GEMINI_API_KEY -ErrorAction SilentlyContinue }
}
