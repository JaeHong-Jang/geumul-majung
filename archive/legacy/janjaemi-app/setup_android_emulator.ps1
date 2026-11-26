# 잔재미 앱 안드로이드 에뮬레이터 실행 환경 설치 + 실행
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$AppDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$Log      = Join-Path $AppDir 'emulator_setup_log.txt'
Start-Transcript -Path $Log -Force | Out-Null
function Step($m) { Write-Host ""; Write-Host "==== $m ====" -ForegroundColor Cyan }

$Root     = Join-Path $env:LOCALAPPDATA 'Android'
$Sdk      = Join-Path $Root 'Sdk'
$JdkDir   = Join-Path $Root 'jdk17'
$Flutter  = Join-Path $env:USERPROFILE 'flutter'
$Avd      = 'Pixel_8_API_35'
$Image    = 'system-images;android-35;google_apis;x86_64'
New-Item -ItemType Directory -Force -Path $Root, $Sdk | Out-Null

function Get-Zip($url, $dest) {
  Write-Host "다운로드: $url"
  Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
}

try {
  # 1) JDK 17
  Step '1/6 JDK 17 확인'
  $java = $null
  if (Test-Path (Join-Path $JdkDir 'bin\java.exe')) { $java = $JdkDir }
  elseif ($env:JAVA_HOME -and (Test-Path (Join-Path $env:JAVA_HOME 'bin\java.exe'))) {
    $v = & (Join-Path $env:JAVA_HOME 'bin\java.exe') -version 2>&1 | Out-String
    if ($v -match 'version "(\d+)' -and [int]$Matches[1] -ge 17) { $java = $env:JAVA_HOME }
  }
  if (-not $java) {
    $zip = Join-Path $env:TEMP 'jdk17.zip'
    Get-Zip 'https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse' $zip
    $tmp = Join-Path $env:TEMP 'jdk17_x'; if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
    Expand-Archive $zip $tmp -Force
    $inner = Get-ChildItem $tmp -Directory | Select-Object -First 1
    if (Test-Path $JdkDir) { Remove-Item $JdkDir -Recurse -Force }
    Move-Item $inner.FullName $JdkDir
    Remove-Item $zip, $tmp -Recurse -Force -ErrorAction SilentlyContinue
    $java = $JdkDir
  }
  $env:JAVA_HOME = $java
  $env:Path = "$java\bin;$env:Path"
  Write-Host "JAVA_HOME = $java"

  # 2) Android 명령줄 도구
  Step '2/6 Android SDK 명령줄 도구'
  $cl = Join-Path $Sdk 'cmdline-tools\latest'
  if (-not (Test-Path (Join-Path $cl 'bin\sdkmanager.bat'))) {
    $zip = Join-Path $env:TEMP 'cmdline-tools.zip'
    Get-Zip 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip' $zip
    $tmp = Join-Path $env:TEMP 'cltools_x'; if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
    Expand-Archive $zip $tmp -Force
    New-Item -ItemType Directory -Force -Path (Split-Path $cl) | Out-Null
    if (Test-Path $cl) { Remove-Item $cl -Recurse -Force }
    Move-Item (Join-Path $tmp 'cmdline-tools') $cl
    Remove-Item $zip, $tmp -Recurse -Force -ErrorAction SilentlyContinue
  }
  $env:ANDROID_HOME = $Sdk; $env:ANDROID_SDK_ROOT = $Sdk
  [Environment]::SetEnvironmentVariable('ANDROID_HOME', $Sdk, 'User')
  $sdkm = Join-Path $cl 'bin\sdkmanager.bat'
  $avdm = Join-Path $cl 'bin\avdmanager.bat'

  # 3) SDK 패키지 + 시스템 이미지
  Step '3/6 에뮬레이터, 시스템 이미지 설치 (가장 오래 걸림)'
  $yes = ("y`n" * 30)
  $yes | & $sdkm --sdk_root="$Sdk" --licenses | Out-Null
  & $sdkm --sdk_root="$Sdk" 'platform-tools' 'emulator' 'platforms;android-35' 'build-tools;35.0.0' $Image
  if ($LASTEXITCODE -ne 0) { throw "sdkmanager 실패 ($LASTEXITCODE)" }

  # 4) 가상 기기(AVD)
  Step '4/6 가상 기기 만들기'
  $emu = Join-Path $Sdk 'emulator\emulator.exe'
  $adb = Join-Path $Sdk 'platform-tools\adb.exe'
  $list = & $emu -list-avds 2>$null
  if (-not ($list -contains $Avd)) {
    $ids = @(& $avdm list device -c 2>$null | ForEach-Object { "$_".Trim() } | Where-Object { $_ })
    $dev = $null
    foreach ($c in 'pixel_8','pixel_7','pixel_6','pixel_5','pixel_4','pixel_3a','pixel') { if ($ids -contains $c) { $dev = $c; break } }
    Write-Host "사용할 기기 정의: $dev"
    if ($dev) { 'no' | & $avdm create avd -n $Avd -k $Image -d $dev --force }
    else      { 'no' | & $avdm create avd -n $Avd -k $Image --force }
    if ($LASTEXITCODE -ne 0) { throw "avdmanager 실패 ($LASTEXITCODE)" }
  }
  & $emu -accel-check

  # 5) Flutter SDK
  Step '5/6 Flutter SDK'
  if (-not (Test-Path (Join-Path $Flutter 'bin\flutter.bat'))) {
    git clone https://github.com/flutter/flutter.git -b stable --depth 1 "$Flutter"
    if ($LASTEXITCODE -ne 0) { throw 'Flutter git clone 실패' }
  }
  $env:Path = "$Flutter\bin;$Sdk\platform-tools;$env:Path"
  & flutter.bat config --android-sdk "$Sdk" --no-analytics
  $yes | & flutter.bat doctor --android-licenses | Out-Null
  & flutter.bat doctor

  # 6) 에뮬레이터 켜고 앱 실행
  Step '6/6 에뮬레이터 실행 + 잔재미 앱 설치'
  Start-Process -FilePath $emu -ArgumentList @('-avd', $Avd, '-netdelay', 'none', '-netspeed', 'full')
  & $adb wait-for-device
  Write-Host '부팅 기다리는 중...'
  do { Start-Sleep 3; $b = (& $adb shell getprop sys.boot_completed 2>$null) } while ("$b".Trim() -ne '1')
  Set-Location $AppDir
  & flutter.bat pub get
  & flutter.bat run -d emulator-5554
}
catch {
  Write-Host ""
  Write-Host "[오류] $($_.Exception.Message)" -ForegroundColor Red
}
finally {
  Stop-Transcript | Out-Null
  Write-Host ''
  Read-Host '창을 닫으려면 Enter'
}
