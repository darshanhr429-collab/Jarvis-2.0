@echo off
title J.A.R.V.I.S. — Voice Assistant
cd /d "%~dp0"
python -u "%~dp0jarvis_desktop.py" %*
