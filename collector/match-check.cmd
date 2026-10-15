<# : batch portion
@echo off
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "$f='%~f0'; iex ([IO.File]::ReadAllText($f, [Text.Encoding]::UTF8))"
pause
exit /b
#>
# =====================================================================
#  최근 경기 확인 (스타 보스 공략대)
#  ---------------------------------------------------------------------
#  스타크래프트: 리마스터가 켜져 있고 로그인한 PC에서 더블클릭해 실행합니다. 설치는 필요 없습니다.
#  아이디의 최근 래더 경기 목록과 가장 최근 경기의 상세 정보(리플레이 주소, 플레이어별 결과·나간 시점)를
#  읽어서 바탕화면의 sc-match-check.txt 에 저장하고 클립보드에 복사합니다.
#  이 내용을 운영자에게 보내 주면 "상대가 바로 나간 경기 제외" 기능을 만드는 데 씁니다.
#  읽기만 하고 레이드 사이트나 다른 곳에는 아무것도 쓰지 않습니다.
# =====================================================================
$Version = '1.0'
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
try { [Net.ServicePointManager]::ServerCertificateValidationCallback = { $true } } catch {}
$GW_NAME = [ordered]@{ 30 = '한국'; 45 = '아시아'; 10 = '미국 서부'; 11 = '미국 동부'; 20 = '유럽' }

function Log($msg, $color = 'Gray') { Write-Host $msg -ForegroundColor $color }
function Http($url, $timeoutMs = 10000) {
  $req = [Net.HttpWebRequest]::Create($url); $req.Method = 'GET'; $req.Timeout = $timeoutMs; $req.ReadWriteTimeout = $timeoutMs
  $res = $req.GetResponse()
  try { $sr = New-Object IO.StreamReader($res.GetResponseStream(), [Text.Encoding]::UTF8); return $sr.ReadToEnd() } finally { $res.Close() }
}
function Enc($s) { [Uri]::EscapeDataString([string]$s) }
function Err($e) { $x = $e.Exception; while ($x.InnerException) { $x = $x.InnerException }; return $x.Message }

# ---------- 스타크래프트 로컬 주소 찾기 (수집기와 같은 방법) ----------
function Find-LocalApi {
  if ($env:RAID_LOCAL_API) { return $env:RAID_LOCAL_API }
  $procs = @(Get-Process -Name 'StarCraft' -ErrorAction SilentlyContinue)
  if (-not $procs.Count) { return $null }
  $ids = $procs | ForEach-Object { $_.Id }
  $ports = @()
  try { $ports = @(Get-NetTCPConnection -State Listen -OwningProcess $ids -ErrorAction Stop | ForEach-Object { $_.LocalPort }) } catch {}
  if (-not $ports.Count) {
    foreach ($line in (netstat -ano -p tcp)) {
      $p = ($line -split '\s+') | Where-Object { $_ }
      if ($p.Count -ge 5 -and $p[3] -eq 'LISTENING' -and $ids -contains [int]$p[4]) { $ports += [int](($p[1] -split ':')[-1]) }
    }
  }
  foreach ($port in ($ports | Sort-Object -Unique)) {
    foreach ($scheme in 'http', 'https') {
      $u = "{0}://127.0.0.1:{1}" -f $scheme, $port
      try { $t = Http "$u/web-api/v1/gateway" 2500; if ($t -match '"region"') { return $u } } catch {}
    }
  }
  return $null
}
# 응답 안에서 경기 ID 처럼 보이는 값 찾기 (MM-... 형식 또는 match_id 필드)
function Find-MatchIds($o, $out) {
  if ($null -eq $o -or $out.Count -ge 10) { return }
  if ($o -is [string]) { return }
  if ($o -is [System.Collections.IEnumerable] -and -not ($o -is [PSCustomObject])) { foreach ($x in $o) { Find-MatchIds $x $out }; return }
  foreach ($p in $o.PSObject.Properties) {
    $v = $p.Value
    if ($v -is [string] -and (($v -match '^MM-[0-9A-Fa-f-]{8,}$') -or ($p.Name -match '^match_?id$'))) { if (-not $out.Contains($v)) { [void]$out.Add($v) } }
    elseif ($null -ne $v -and -not ($v -is [string]) -and -not ($v -is [ValueType])) { Find-MatchIds $v $out }
  }
}

Write-Host ''
Log ("최근 경기 확인 v{0}" -f $Version) 'Cyan'
Log '----------------------------------------'
$api = Find-LocalApi
if (-not $api) { Log '스타크래프트: 리마스터를 찾지 못했습니다. 게임을 켜고 로그인한 뒤 다시 실행하세요.' 'Red'; return }
Log "스타크래프트 로컬 주소: $api" 'Green'
$toon = (Read-Host '확인할 게임 아이디 (래더를 한 판 이상 한 아이디)').Trim()
if (-not $toon) { Log '아이디를 입력하지 않아 끝냅니다.' 'Yellow'; return }
Log ('서버: ' + (($GW_NAME.GetEnumerator() | ForEach-Object { "{0}={1}" -f $_.Key, $_.Value }) -join ', '))
$gwIn = (Read-Host '서버 번호 (그냥 Enter = 30 한국)').Trim()
$gw = if ($gwIn) { [int]$gwIn } else { 30 }

$out = [ordered]@{ tool = "match-check $Version"; time = (Get-Date).ToString('s'); api = $api; toon = $toon; gw = $gw; steps = @() }
try {
  $prof = Http ("$api/web-api/v2/aurora-profile-by-toon/{0}/{1}?request_flags=scr_mmtooninfo" -f (Enc $toon), $gw) | ConvertFrom-Json
  $season = $prof.matchmaked_current_season; $out.season = $season
  Log "현재 시즌: $season"
  $listRaw = $null; $listPath = $null
  foreach ($p in @(("/web-api/v1/matchmaker-gameinfo-by-toon/{0}/{1}/1/{2}?offset=0&limit=5" -f (Enc $toon), $gw, $season), ("/web-api/v1/matchmaker-gameinfo-by-toon/{0}/{1}/1/{2}" -f (Enc $toon), $gw, $season))) {
    try { $listRaw = Http ($api + $p); $listPath = $p; break } catch { $out.steps += [ordered]@{ what = '경기 목록 실패'; path = $p; error = (Err $_) } }
  }
  if (-not $listRaw) { throw '경기 목록을 받지 못했습니다.' }
  $out.steps += [ordered]@{ what = '경기 목록'; path = $listPath; raw = $listRaw }
  $ids = New-Object System.Collections.ArrayList
  Find-MatchIds ($listRaw | ConvertFrom-Json) $ids
  Log ("최근 경기 {0}개 찾음" -f $ids.Count) 'Green'
  if ($ids.Count) {
    $p = "/web-api/v1/matchmaker-gameinfo-playerinfo/{0}" -f (Enc $ids[0])
    $infoRaw = Http ($api + $p)
    $out.steps += [ordered]@{ what = '최근 경기 상세'; path = $p; raw = $infoRaw }
    $info = $infoRaw | ConvertFrom-Json
    $reps = @($info.replays)
    Log ("최근 경기 ID: {0} · 리플레이 {1}개" -f $ids[0], $reps.Count) 'Green'
    if ($reps.Count -and $reps[0].url) { Log ("리플레이 주소: {0}" -f $reps[0].url) }
  }
} catch { $out.error = (Err $_); Log ("조회 실패: " + $out.error) 'Red' }

$text = $out | ConvertTo-Json -Depth 12
$dir = [Environment]::GetFolderPath('Desktop'); if (-not $dir) { $dir = [IO.Path]::GetTempPath() }
$file = Join-Path $dir 'sc-match-check.txt'
try { [IO.File]::WriteAllText($file, $text, (New-Object Text.UTF8Encoding($false))); Log "결과 저장: $file" 'Cyan' } catch { Log ("파일 저장 실패: " + (Err $_)) 'Yellow' }
try { Set-Clipboard -Value $text; Log '결과를 클립보드에 복사했습니다. 그대로 붙여넣어 보내 주세요.' 'Cyan' } catch {}
try { Start-Process notepad.exe $file } catch {}
