$ErrorActionPreference = "Stop"
$headers = @{ "User-Agent" = "LectureEscapeAssetTool/1.0" }
$root = Join-Path $PSScriptRoot "..\assets\polyhaven-2k"
New-Item -ItemType Directory -Force -Path $root | Out-Null
$keywords = "chair|cabinet|table|lamp|clock|book|key|lock|box|case|camera|computer|keyboard|phone|radio|monitor|tool|wrench|screw|cutter|hammer|bottle|chest|shelf|desk|mirror|painting|vase|statue|globe|microscope|flask|lever|valve|pipe|wire|battery|fuse|sign|cash|machine|door|bed|locker|suitcase|rope|candle|circuit|safe|light|stool|sofa|bench|crate|barrel|fan|switch|control|screen|generator|terminal|goblet|mask|extinguisher|ticket|compass|binoculars"
$assets = Invoke-RestMethod -Headers $headers -Uri "https://api.polyhaven.com/assets"
$candidates = $assets.PSObject.Properties | Where-Object { $_.Value.type -eq 2 -and (($_.Name + " " + $_.Value.name + " " + $_.Value.category + " " + ($_.Value.tags -join " ")) -match $keywords) } | Sort-Object { $_.Value.name }
$selected = [System.Collections.Generic.List[object]]::new()
foreach ($candidate in $candidates) {
  if ($selected.Count -ge 100) { break }
  $files = Invoke-RestMethod -Headers $headers -Uri ("https://api.polyhaven.com/files/" + $candidate.Name)
  if ($files.blend."2k".blend) { $selected.Add([PSCustomObject]@{ id=$candidate.Name; name=$candidate.Value.name; source="https://polyhaven.com/a/" + $candidate.Name; model=$files.blend."2k".blend }) }
}
$manifest = @()
foreach ($asset in $selected) {
  $directory = Join-Path $root $asset.id
  $marker = Join-Path $directory "asset-manifest.json"
  if (Test-Path $marker) { $manifest += Get-Content -Raw $marker | ConvertFrom-Json; continue }
  New-Item -ItemType Directory -Force -Path $directory | Out-Null
  $downloads = @([PSCustomObject]@{ path=(Split-Path $asset.model.url -Leaf); url=$asset.model.url; size=$asset.model.size })
  foreach ($entry in $asset.model.include.PSObject.Properties) { $downloads += [PSCustomObject]@{ path=$entry.Name; url=$entry.Value.url; size=$entry.Value.size } }
  foreach ($download in $downloads) {
    $destination = Join-Path $directory $download.path
    New-Item -ItemType Directory -Force -Path (Split-Path $destination -Parent) | Out-Null
    if (-not (Test-Path $destination)) { Invoke-WebRequest -Headers $headers -Uri $download.url -OutFile $destination }
  }
  $entry = [PSCustomObject]@{ id=$asset.id; name=$asset.name; source=$asset.source; format="blend"; textureResolution="2k"; license="CC0-1.0"; files=$downloads }
  $entry | ConvertTo-Json -Depth 6 | Set-Content $marker
  $manifest += $entry
}
$manifest | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $root "manifest.json")
