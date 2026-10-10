<# : batch portion
@echo off
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "$f='%~f0'; iex ([IO.File]::ReadAllText($f, [Text.Encoding]::UTF8))"
pause
exit /b
#>
# =====================================================================
#  래더 점수 자동 수집기 (래더 협동 보스 레이드)
#  ---------------------------------------------------------------------
#  스타크래프트: 리마스터가 켜져 있는 PC 한 대에서 실행합니다.
#  레이드 공략대원에 등록된 래더 아이디의 점수를 주기적으로 조회해서,
#  래더 한 판이 끝날 때마다 승패와 점수 변동을 레이드 사이트에 자동으로 넣습니다.
#
#  - 스타크래프트에 로그인한 상태여야 합니다 (게임 클라이언트의 래더 조회 기능을 씁니다).
#  - 레이드 사이트에 Firebase 가 연결되어 있어야 합니다.
#  - 창을 닫으면 수집이 멈춥니다. 다시 실행하면 이어서 수집합니다.
# =====================================================================

# ---------- 설정 (보통은 바꿀 필요 없음) ----------
$SiteUrl     = 'https://rairen.github.io/SC_Ladder_Co-op_Raid/'   # 레이드 사이트 주소
$DatabaseUrl = ''        # 비워두면 사이트의 firebase-config.js 에서 읽음
$Mode        = 'coop'    # 협동 레이드 데이터 위치
$IntervalSec = 20        # 조회 간격(초)
$LocalApi    = ''        # 비워두면 스타크래프트가 연 주소를 자동으로 찾음 (예: http://127.0.0.1:50250)
$ApiKey      = ''        # 비워두면 사이트의 firebase-config.js 에서 읽음 (수집기 로그인용)
$Version     = '1.3'
# -------------------------------------------------

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
try { [Net.ServicePointManager]::ServerCertificateValidationCallback = { $true } } catch {}
if ($env:RAID_SITE_URL)  { $SiteUrl = $env:RAID_SITE_URL }
if ($env:RAID_DB_URL)    { $DatabaseUrl = $env:RAID_DB_URL }
if ($env:RAID_API_KEY)   { $ApiKey = $env:RAID_API_KEY }
if ($env:RAID_LOCAL_API) { $LocalApi = $env:RAID_LOCAL_API }
if ($env:RAID_INTERVAL)  { $IntervalSec = [int]$env:RAID_INTERVAL }
$Once = [bool]$env:RAID_ONCE

$GATEWAYS = @(30, 45, 10, 11, 20)   # 한국, 아시아, 미국 서부, 미국 동부, 유럽
$GW_NAME  = @{ 30 = '한국'; 45 = '아시아'; 10 = '미국 서부'; 11 = '미국 동부'; 20 = '유럽' }

function Now-Ms { [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
function Log($msg, $color = 'Gray') { Write-Host ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $msg) -ForegroundColor $color }

# HTTP 요청 (UTF-8, 시간 제한)
function Http($method, $url, $body = $null, $timeoutMs = 8000, $ctype = 'application/json; charset=utf-8') {
  $req = [Net.HttpWebRequest]::Create($url)
  $req.Method = $method
  $req.Timeout = $timeoutMs
  $req.ReadWriteTimeout = $timeoutMs
  if ($null -ne $body) {
    $bytes = [Text.Encoding]::UTF8.GetBytes($body)
    $req.ContentType = $ctype
    $req.ContentLength = $bytes.Length
    $s = $req.GetRequestStream(); $s.Write($bytes, 0, $bytes.Length); $s.Close()
  }
  $res = $req.GetResponse()
  try {
    $sr = New-Object IO.StreamReader($res.GetResponseStream(), [Text.Encoding]::UTF8)
    return $sr.ReadToEnd()
  } finally { $res.Close() }
}
function Err($e) {
  $x = $e.Exception; while ($x.InnerException) { $x = $x.InnerException }
  $m = $x.Message
  if ($m -match '\(401\)|\(403\)|Unauthorized|Forbidden|Permission denied') { $m += ' → 권한 없음: Firebase 콘솔 Authentication 에서 "익명" 로그인을 사용 설정했는지, 보안 규칙이 최신인지 확인하세요.' }
  elseif ($m -match '\(404\)') { $m += ' → 주소를 찾지 못함' }
  return $m
}
function ToJson($o) { ConvertTo-Json -InputObject $o -Depth 10 -Compress }
function Enc($s) { [Uri]::EscapeDataString([string]$s) }

# ---------- Firebase (REST) ----------
# 수집기 로그인: Firebase 익명 로그인으로 토큰을 받아 쓰기 권한을 얻습니다 (1시간마다 갱신).
$script:IdToken = ''; $script:RefreshToken = ''; $script:TokenUntil = [DateTime]::MinValue; $script:NextAuthTry = [DateTime]::MinValue; $script:AuthWarned = $false
$IdpUrl = 'https://identitytoolkit.googleapis.com/v1/accounts:signUp'; $StsUrl = 'https://securetoken.googleapis.com/v1/token'
if ($env:RAID_IDP_URL) { $IdpUrl = $env:RAID_IDP_URL; $StsUrl = $env:RAID_STS_URL }
function Get-Token {
  if (-not $ApiKey) { return '' }
  if ($script:IdToken -and [DateTime]::UtcNow -lt $script:TokenUntil) { return $script:IdToken }
  if (-not $script:IdToken -and [DateTime]::UtcNow -lt $script:NextAuthTry) { return '' }
  try {
    if ($script:RefreshToken) {
      $r = (Http 'POST' "$($StsUrl)?key=$ApiKey" ("grant_type=refresh_token&refresh_token=" + (Enc $script:RefreshToken)) 10000 'application/x-www-form-urlencoded') | ConvertFrom-Json
      $script:IdToken = $r.id_token; $script:RefreshToken = $r.refresh_token; $sec = [int]$r.expires_in
    } else {
      $r = (Http 'POST' "$($IdpUrl)?key=$ApiKey" '{"returnSecureToken":true}' 10000) | ConvertFrom-Json
      $script:IdToken = $r.idToken; $script:RefreshToken = $r.refreshToken; $sec = [int]$r.expiresIn
      Log '수집기 로그인 완료 (익명)' 'Green'
    }
    $script:TokenUntil = [DateTime]::UtcNow.AddSeconds([Math]::Max(60, $sec - 300))
    return $script:IdToken
  } catch {
    $script:IdToken = ''; $script:RefreshToken = ''; $script:NextAuthTry = [DateTime]::UtcNow.AddMinutes(5)
    if (-not $script:AuthWarned) { Log 'Firebase 익명 로그인을 하지 못했습니다. 콘솔의 Authentication > 로그인 방법에서 "익명"을 사용 설정하세요.' 'Yellow'; $script:AuthWarned = $true }
    return ''
  }
}
function Db-Url($path) { $u = $DatabaseUrl.TrimEnd('/') + '/' + $path + '.json'; $t = Get-Token; if ($t) { $u += '?auth=' + $t }; return $u }
function Db-Get($path) { $t = Http 'GET' (Db-Url $path); if ($t -eq 'null' -or -not $t) { return $null }; return ($t | ConvertFrom-Json) }
function Db-Put($path, $obj) { [void](Http 'PUT' (Db-Url $path) (ToJson $obj)) }
function Db-Patch($path, $obj) { [void](Http 'PATCH' (Db-Url $path) (ToJson $obj)) }
function Db-Post($path, $obj) { [void](Http 'POST' (Db-Url $path) (ToJson $obj)) }

function Find-DatabaseUrl {
  if ($DatabaseUrl) { return $DatabaseUrl }
  $js = Http 'GET' ($SiteUrl.TrimEnd('/') + '/firebase-config.js?t=' + (Now-Ms))
  $m = [regex]::Match($js, 'databaseURL\s*:\s*["'']([^"'']+)["'']')
  if (-not $m.Success -or $m.Groups[1].Value -match '여기에') { throw '사이트에 Firebase 가 연결되어 있지 않습니다 (firebase-config.js).' }
  $k = [regex]::Match($js, 'apiKey\s*:\s*["'']([^"'']+)["'']')
  if ($k.Success) { $script:ApiKey = $k.Groups[1].Value }
  return $m.Groups[1].Value
}

# ---------- 스타크래프트 로컬 주소 찾기 ----------
function Find-LocalApi {
  if ($LocalApi) { return $LocalApi }
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
      try { $t = Http 'GET' "$u/web-api/v1/gateway" $null 2500; if ($t -match '"region"') { return $u } } catch {}
    }
  }
  return $null
}

# ---------- 래더 정보 조회 ----------
# 반환: @{ ok; rating; wins; losses; season; err }
function Get-Ladder($api, $toon, $gw) {
  $t = Http 'GET' ("$api/web-api/v2/aurora-profile-by-toon/{0}/{1}?request_flags=scr_mmtooninfo" -f (Enc $toon), $gw) $null 10000
  $d = $t | ConvertFrom-Json
  $season = $d.matchmaked_current_season
  if ($null -eq $season) { return @{ ok = $false; err = '프로필 없음' } }
  $st = @($d.matchmaked_stats) | Where-Object { $_ -and $_.season_id -eq $season -and $_.game_mode_id -eq 1 -and ([string]$_.toon) -ieq $toon } | Select-Object -First 1
  if (-not $st) { return @{ ok = $true; rating = 0; wins = 0; losses = 0; season = $season; err = '이번 시즌 래더 기록 없음' } }
  return @{ ok = $true; rating = [int]$st.rating; wins = [int]$st.wins; losses = [int]$st.losses; season = $season; err = $null }
}
function Find-Gateway($api, $toon, $first) {
  foreach ($gw in (@($first) + $GATEWAYS | Select-Object -Unique)) {
    try { $r = Get-Ladder $api $toon $gw; if ($r.ok -and -not $r.err) { $r.gw = $gw; return $r } } catch {}
  }
  try { $r = Get-Ladder $api $toon $first; $r.gw = $first; return $r } catch { return @{ ok = $false; gw = $first; err = '아이디를 찾지 못함' } }
}

function Roster-Key($name) { ([string]$name) -replace '[.#$\[\]/]', '_' }
function Members-Of($raid) {
  if ($null -eq $raid.members) { return @() }
  if ($raid.members -is [array]) { return @($raid.members | Where-Object { $_ }) }
  return @($raid.members.PSObject.Properties | ForEach-Object { $_.Value })
}

# ---------- 시작 ----------
Write-Host ''
Write-Host "  래더 협동 보스 레이드 · 래더 점수 자동 수집기 v$Version" -ForegroundColor Cyan
Write-Host '  이 창을 열어 두는 동안 공략대원의 래더 결과가 자동으로 들어갑니다. (종료: 창 닫기)' -ForegroundColor DarkGray
Write-Host ''
try { $DatabaseUrl = Find-DatabaseUrl; Log "레이드 저장소: $DatabaseUrl" }
catch { Log ("레이드 사이트 설정을 읽지 못했습니다: " + (Err $_)) 'Red'; return }

$api = $null
$cache = @{}          # 공략대원별 마지막 기록 (rating, wins, losses, season, id, gw)
$caches = @{}         # 공략대별 기억

while ($true) {
  $state = 'ok'; $msg = ''
  try {
    if (-not $api) {
      $api = Find-LocalApi
      if ($api) { Log "스타크래프트 연결: $api" 'Green' }
    }
    if (-not $api) {
      $state = 'nogame'; $msg = '스타크래프트가 켜져 있지 않거나 로그인 전입니다'
      Log $msg 'Yellow'
    } else {
      $all = Db-Get "$Mode/raids"
      $list = @(); if ($all) { $list = @($all.PSObject.Properties | ForEach-Object { $_.Value } | Where-Object { $_ -and $_.raidId }) }
      if (-not $list.Count) {
        $state = 'noraid'; $msg = '진행 중인 공략대 없음'
      } else {
       $count = 0
       foreach ($raid in $list) {
        $rid = [string]$raid.raidId
        if (-not $caches.ContainsKey($rid)) {
          $c0 = @{}
          $saved = Db-Get "$Mode/ladder/$rid"
          if ($saved) { foreach ($p in $saved.PSObject.Properties) { $v = $p.Value; $c0[$p.Name] = @{ id = $v.id; gw = $v.gw; season = $v.season; rating = $v.rating; wins = $v.wins; losses = $v.losses } } }
          $caches[$rid] = $c0
          Log ("{0}공략대: {1}" -f $raid.squad, $raid.name) 'Cyan'
        }
        $cache = $caches[$rid]
        foreach ($m in (Members-Of $raid)) {
          if (-not $api) { $state = 'nogame'; $msg = '스타크래프트 연결이 끊겼습니다. 다시 찾는 중'; break }
          $key = Roster-Key $m
          $ro = $null; if ($raid.roster) { $ro = $raid.roster.$key }
          $toon = if ($ro -and $ro.ladder) { ([string]$ro.ladder).Trim() } else { '' }
          if (-not $toon) { continue }
          $count++
          $gw = if ($ro.gw) { [int]$ro.gw } else { 30 }
          $prev = $cache[$key]
          $snap = @{ id = $toon; gw = $gw; t = (Now-Ms) }
          try {
            $r = Get-Ladder $api $toon $gw
            if ($r.err -and (-not $prev -or $prev.id -ne $toon)) {
              # 등록 직후 못 찾으면 다른 서버도 찾아봄
              $r2 = Find-Gateway $api $toon $gw
              if ($r2.ok -and -not $r2.err -and $r2.gw -ne $gw) { $gw = $r2.gw; $snap.gw = $gw; $r = $r2; Db-Patch "$Mode/raids/$rid/roster/$(Enc $key)" @{ gw = $gw }; Log "$m : $($GW_NAME[$gw]) 서버에서 찾음" }
            }
            if (-not $r.ok) { throw $r.err }
            $snap.rating = $r.rating; $snap.wins = $r.wins; $snap.losses = $r.losses; $snap.season = $r.season; $snap.err = $r.err
            if (-not $prev -or $prev.id -ne $toon -or [int]$prev.gw -ne $gw -or $prev.season -ne $r.season) {
              if ($r.err) { Log "$m ($toon) : $($r.err)" 'Yellow' } else { Log ("{0} ({1}) 기준 점수 {2}" -f $m, $toon, $r.rating) }
            } else {
              $dw = $r.wins - [int]$prev.wins; $dl = $r.losses - [int]$prev.losses; $n = $dw + $dl
              if ($n -gt 0) {
                $delta = $r.rating - [int]$prev.rating
                if ([int]$prev.rating -gt 0 -and $r.rating -gt 0) {
                  $win = ($dw -gt 0 -and $dl -eq 0) -or ($dw -gt 0 -and $dl -gt 0 -and $delta -ge 0)
                  $pts = [Math]::Abs($delta)
                  $ev = @{ raidId = $rid; t = (Now-Ms); type = 'game'; member = [string]$m; points = $(if ($win) { $pts } else { -$pts });
                           multi = $false; same = $false; banned = $false; undone = $false; auto = $true; rating = $r.rating }
                  if ($n -gt 1) { $ev.games = $n }
                  Db-Post "$Mode/events/$rid" $ev
                  Log ("{0} {1} {2}{3}점 (점수 {4} → {5}){6}" -f $m, $(if ($win) { '승리' } else { '패배' }), $(if ($win) { '+' } else { '-' }), $pts, $prev.rating, $r.rating, $(if ($n -gt 1) { " · ${n}판 합산" } else { '' })) $(if ($win) { 'Green' } else { 'Magenta' })
                } else {
                  $snap.err = '배치 게임 중이라 점수 변동을 알 수 없음 (직접 입력)'
                  Log "$m : $($snap.err)" 'Yellow'
                }
              }
            }
            $cache[$key] = @{ id = $toon; gw = $gw; season = $r.season; rating = $r.rating; wins = $r.wins; losses = $r.losses }
          } catch {
            $snap.err = '조회 실패: ' + (Err $_)
            if ($prev) { $snap.rating = $prev.rating; $snap.wins = $prev.wins; $snap.losses = $prev.losses; $snap.season = $prev.season }
            Log "$m ($toon) $($snap.err)" 'Yellow'
            if ((Err $_) -match '연결|connect|refused|actively') { $api = $null }
          }
          Db-Put "$Mode/ladder/$rid/$(Enc $key)" $snap
        }
        if (-not $api) { break }
       }
        if ($state -eq 'ok') { $msg = "공략대 $($list.Count)개 · $count 명 수집 중" }
      }
    }
  } catch {
    $state = 'error'; $msg = (Err $_)
    Log "오류: $msg" 'Red'
  }
  try { Db-Put "$Mode/collector" @{ t = (Now-Ms); state = $state; msg = $msg; ver = $Version }; if (-not $script:BeatOk) { Log '레이드 사이트에 수집기 상태를 기록했습니다 (사이트에 "수집 중" 또는 대기 상태가 표시됩니다)' 'Green'; $script:BeatOk = $true } } catch { $script:BeatOk = $false; Log ('레이드 사이트에 기록하지 못했습니다: ' + (Err $_)) 'Red' }
  if ($Once) { break }
  Start-Sleep -Seconds $IntervalSec
}
