Set WshShell = CreateObject("WScript.Shell")
Set Fso = CreateObject("Scripting.FileSystemObject")
ProjectRoot = Fso.GetParentFolderName(Fso.GetParentFolderName(WScript.ScriptFullName))
WshShell.CurrentDirectory = ProjectRoot
LaunchCommand = "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ProjectRoot & "\scripts\launchers\silent_launcher.ps1"""
WshShell.Run LaunchCommand, 0, False
