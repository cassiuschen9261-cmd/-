Set WshShell = CreateObject("WScript.Shell")
Set Fso = CreateObject("Scripting.FileSystemObject")
ProjectRoot = Fso.GetParentFolderName(Fso.GetParentFolderName(WScript.ScriptFullName))
WshShell.CurrentDirectory = ProjectRoot
LaunchCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -NoExit -Command ""Set-Location -LiteralPath '" & ProjectRoot & "'; $host.UI.RawUI.WindowTitle='PAIBAN_SERVER_VISIBLE'; node server.js"""
WshShell.Run LaunchCommand, 1, False
