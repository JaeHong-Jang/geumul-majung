@echo off
chcp 65001 >nul
cd /d "%~dp0"
where flutter >nul 2>nul && goto run
for %%D in ("%USERPROFILE%\flutter" "%USERPROFILE%\development\flutter" "%USERPROFILE%\dev\flutter" "%USERPROFILE%\src\flutter" "%USERPROFILE%\source\flutter" "%USERPROFILE%\fvm\default" "%LOCALAPPDATA%\flutter" "%LOCALAPPDATA%\Pub\flutter" "C:\flutter" "C:\src\flutter" "C:\dev\flutter" "C:\tools\flutter" "C:\Program Files\flutter" "D:\flutter" "D:\src\flutter") do (
  if exist "%%~D\bin\flutter.bat" (
    echo Flutter 발견: %%~D
    set "PATH=%%~D\bin;%PATH%"
    goto run
  )
)
echo [오류] 이 PC에서 Flutter SDK를 찾지 못했습니다.
echo 설치: https://docs.flutter.dev/get-started/install/windows
pause
exit /b 1
:run
if not exist web\index.html call flutter create --platforms=web .
call flutter pub get
call flutter run -d web-server --web-port 5555 --web-hostname localhost
pause
