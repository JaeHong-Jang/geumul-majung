# Windows에서 서버를 켜고 Chrome에 잔재미 앱을 폰 크기로 띄운다(-Android: 에뮬레이터).
# 실행: 저장소 맨 위 폴더에서  powershell -ExecutionPolicy Bypass -File run-windows.ps1
# 필요: Python 3.12+, Flutter, Chrome  (-Android일 때는 Android Studio와 에뮬레이터 1개)
param(
    [switch]$ServerOnly,  # 서버만 켜고 끝낸다(CI 점검용)
    [switch]$Android      # Chrome 대신 안드로이드 에뮬레이터에 띄운다
)
$ErrorActionPreference = 'Stop'
$legacyRoot = $PSScriptRoot
$root = (Resolve-Path (Join-Path $legacyRoot "../..")).Path
$backend = Join-Path $root 'backend'
$py = Join-Path $backend '.venv\Scripts\python.exe'
# 로컬 SQLite 데모 DB 전용 비밀번호. 실서버에 쓰지 말 것
$demoPassword = 'janjaemi-demo-password'
$api = 'http://127.0.0.1:8000'
$webPort = 5050

function Need($cmd, $hint) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "$cmd 을(를) 찾을 수 없어요. $hint" }
}

# 1. 백엔드 가상환경 (처음 한 번)
if (-not (Test-Path $py)) {
    Need 'py' 'https://www.python.org 에서 Python 3.12 이상을 설치하세요'
    Write-Host '[1/3] 백엔드 가상환경 만드는 중...'
    py -3 -m venv (Join-Path $backend '.venv')
    $deps = & $py -c "import tomllib;print('\n'.join(tomllib.load(open(r'$backend\pyproject.toml','rb'))['project']['dependencies']))"
    & $py -m pip install --quiet @($deps)
    if ($LASTEXITCODE) { throw '백엔드 패키지 설치 실패' }
}

# 2. 서버 켜기 (새 창)
Push-Location $backend
$firstRun = -not (Test-Path 'masdae.db')
if ($firstRun) {
    Write-Host '[2/3] 데모 회사 계정 만드는 중...'
    $env:SEED_PASSWORD = $demoPassword
    & $py -m seed.gumi_demo
    if ($LASTEXITCODE) { throw '데모 계정 생성 실패' }
}
$env:JWT_SECRET = -join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
# Ollama(기본 LLM)가 꺼져 있어도 앱은 규칙 문장으로 동작한다. 환경변수 LLM_PROVIDER, OLLAMA_URL로 바꿀 수 있다
if (-not $env:LLM_PROVIDER) { $env:LLM_PROVIDER = 'ollama' }
if (-not $env:OLLAMA_URL) { $env:OLLAMA_URL = 'http://localhost:11434' }
$env:CORS_ORIGINS = "http://localhost:$webPort"
Start-Process $py -ArgumentList '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000' -WorkingDirectory $backend
Pop-Location
Write-Host '서버 켜지는 중...'
for ($i = 0; $i -lt 30; $i++) {
    try { Invoke-RestMethod "$api/v1/health" | Out-Null; break } catch { Start-Sleep 1 }
}
if ($i -eq 30) { throw '서버가 30초 안에 켜지지 않았어요. 서버 창의 오류를 확인하세요' }
if ($firstRun) {
    Push-Location $backend
    & $py -m seed.demo_listings $api $demoPassword
    Pop-Location
    if ($LASTEXITCODE) { throw '데모 매물 등록 실패' }
}

Write-Host ''
Write-Host '로그인 계정 (비밀번호는 모두' $demoPassword ')'
Write-Host '  구매자(재활용업체): 000-00-00004'
Write-Host '  운송기사(운반업체): 000-00-00005'
Write-Host ''
if ($ServerOnly) { return }

Need 'flutter' 'https://docs.flutter.dev/get-started/install/windows 를 따라 설치하세요'
Set-Location (Join-Path $legacyRoot 'janjaemi-app')
if (-not $Android) {
    # 3. Chrome에 앱 띄우기
    Write-Host '[3/3] Chrome에 앱 띄우는 중 (처음은 1~2분 걸려요). 코드 고친 뒤 r 키 = 화면 새로고침'
    flutter run -d chrome --web-port $webPort --dart-define=API_BASE=$api
    return
}

# 3. 에뮬레이터 켜기
Write-Host '[3/4] 에뮬레이터 켜는 중...'
$running = flutter devices --machine | ConvertFrom-Json | Where-Object { $_.emulator -and $_.targetPlatform -like 'android*' }
if (-not $running) {
    $emu = flutter emulators --machine | ConvertFrom-Json | Where-Object { $_.platformType -eq 'android' } | Select-Object -First 1
    if (-not $emu) { throw 'Android Studio > Device Manager에서 에뮬레이터를 하나 만든 뒤 다시 실행하세요' }
    flutter emulators --launch $emu.id
    for ($i = 0; $i -lt 90 -and -not $running; $i++) {
        Start-Sleep 2
        $running = flutter devices --machine | ConvertFrom-Json | Where-Object { $_.emulator -and $_.targetPlatform -like 'android*' }
    }
    if (-not $running) { throw '에뮬레이터가 3분 안에 켜지지 않았어요' }
}

# 4. 앱 실행. 에뮬레이터에서 10.0.2.2 = 이 PC
Write-Host '[4/4] 앱 빌드·실행 중 (처음은 몇 분 걸려요). 코드 고친 뒤 r 키 = 화면 새로고침'
flutter run -d @($running)[0].id --dart-define=API_BASE=http://10.0.2.2:8000
