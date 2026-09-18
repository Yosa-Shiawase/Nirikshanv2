# T6 route-class proofs against the real server (localhost:8080)
$c = "C:\Windows\System32\curl.exe"
$base = "http://localhost:8080"
function Probe($label, $url) {
    $out = "$env:TEMP\t6probe.txt"
    $meta = & $c -s -o $out -w "%{http_code}|%{content_type}|%{size_download}" $url
    $body = ""
    if ($meta -notmatch "application/json") { $body = Get-Content $out -Raw -ErrorAction SilentlyContinue }
    $parts = $meta -split "\|"
    $isRoot = if ($body) { $body -match 'id="root"' } else { $false }
    $isLegacy = if ($body) { $body -match 'pane-alerts' } else { $false }
    $is404 = if ($body) { $body -match 'SIGNAL LOST' } else { $false }
    Write-Output ("{0,-34} status={1} type={2} bytes={3} react={4} legacy={5} branded404={6}" -f $label, $parts[0], $parts[1], $parts[2], $isRoot, $isLegacy, $is404)
}
Probe "/ (react root)"          "$base/"
Probe "/assets/<hashed>.js"     "$base/assets/index-DdxSA40V.js"
Probe "/sw.js"                  "$base/sw.js"
Probe "/404.html"               "$base/404.html"
Probe "/legacy/ (old console)"  "$base/legacy/"
Probe "/legacy/app.js"          "$base/legacy/app.js"
Probe "unknown-extension .js"   "$base/nope.js"
Probe "unknown-extension .png"  "$base/missing.png"
Probe "SPA fallback (no ext)"   "$base/some/deep/offline/route"
Probe "API /health"             "$base/health"
Probe "API /case/trace"         "$base/case/trace"
