@echo off
:: tmux.cmd - Windows wrapper for tmux-shim.js
:: This file must be on PATH so that "tmux" resolves to this shim.
setlocal
set "NODE_BIN=%AUSOME_NODE_PATH%"
if not defined NODE_BIN set "NODE_BIN=node"
"%NODE_BIN%" "%~dp0tmux-shim.js" %*
exit /b %errorlevel%
