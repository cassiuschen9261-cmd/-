Set WshShell = CreateObject("WScript.Shell")
Set Fso = CreateObject("Scripting.FileSystemObject")
Set Http = CreateObject("MSXML2.XMLHTTP")
LauncherDir = Fso.GetParentFolderName(WScript.ScriptFullName)
ProjectRoot = Fso.GetParentFolderName(Fso.GetParentFolderName(WScript.ScriptFullName))
PortFile = ProjectRoot & "\.cache\runtime\.server-port"
TargetUrl = "http://localhost:3000"
HealthUrl = ""

For i = 1 To 120
  If Fso.FileExists(PortFile) Then
    Set F = Fso.OpenTextFile(PortFile, 1)
    Port = Trim(F.ReadAll)
    F.Close
    If Port <> "" Then
      TargetUrl = "http://localhost:" & Port
      HealthUrl = TargetUrl & "/api/health"
      On Error Resume Next
      Http.Open "GET", HealthUrl, False
      Http.Send
      If Err.Number = 0 Then
        If Http.Status = 200 And InStr(1, Http.responseText, """status"":""ok""", vbTextCompare) > 0 Then
          Exit For
        End If
      End If
      Err.Clear
      On Error GoTo 0
    End If
  End If
  WScript.Sleep 250
Next

WshShell.Run TargetUrl
