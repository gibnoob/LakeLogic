@echo off
:: LakeLogic Standalone Entry Point
:: This batch file executes the PowerShell GUI script in "Hidden" mode.
:: The Windows Form will construct the visual interface for the user,
:: keeping the execution clean and backgrounded.

powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0launcher_ui.ps1"
exit
