@echo off
:: tmux.cmd - Windows wrapper for tmux-shim.js
:: This file must be on PATH so that "tmux" resolves to this shim.
setlocal
set "NODE_BIN=%AUSOME_NODE_PATH%"
set "NODE_SOURCE=AUSOME_NODE_PATH"
if not defined NODE_BIN set "NODE_BIN=node"
if not defined AUSOME_NODE_PATH set "NODE_SOURCE=fallback-node"
if defined AUSOME_TMUX_LOG_FILE (
  >>"%AUSOME_TMUX_LOG_FILE%" echo [tmux.cmd %date% %time%] launch nodeSource=%NODE_SOURCE%
)
"%NODE_BIN%" "%~dp0tmux-shim.js" %*
set "TMUX_WRAPPER_EXIT=%errorlevel%"
if defined AUSOME_TMUX_LOG_FILE (
  >>"%AUSOME_TMUX_LOG_FILE%" echo [tmux.cmd %date% %time%] exit code=%TMUX_WRAPPER_EXIT%
)
exit /b %TMUX_WRAPPER_EXIT%
