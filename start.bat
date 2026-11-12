@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel%==0 (
    start "" http://localhost:8000
    node tools\serve.mjs
    goto :eof
)

where python >nul 2>nul
if %errorlevel%==0 (
    echo Node.js не найден, запускаю через Python.
    echo ВНИМАНИЕ: без Node.js индексы не пересобираются автоматически.
    start "" http://localhost:8000
    python -m http.server 8000
    goto :eof
)

echo Не найден ни Node.js, ни Python.
echo Установите Node.js LTS: https://nodejs.org
pause
