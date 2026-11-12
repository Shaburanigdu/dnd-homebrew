@echo off
rem ================================================================
rem  Local server for the site.
rem  Double-click this file, then open http://localhost:8000
rem  NOTE: keep this file ASCII-only with CRLF line endings,
rem  otherwise cmd.exe breaks on it.
rem ================================================================
cd /d "%~dp0"
title DnD Homebrew - local server

where node >nul 2>nul
if %errorlevel%==0 goto run_node

where python >nul 2>nul
if %errorlevel%==0 goto run_python

echo.
echo  Neither Node.js nor Python was found.
echo  Install Node.js LTS from https://nodejs.org and run this file again.
echo.
pause
goto :eof

:run_node
echo.
echo  Starting the site with Node.js...
echo  Site:  http://localhost:8000
echo  Stop:  close this window or press Ctrl+C
echo.
start "" http://localhost:8000
node tools\serve.mjs
pause
goto :eof

:run_python
echo.
echo  Node.js not found, starting with Python instead.
echo  WARNING: indexes will NOT be rebuilt automatically.
echo  Site:  http://localhost:8000
echo.
start "" http://localhost:8000
python -m http.server 8000
pause
goto :eof
