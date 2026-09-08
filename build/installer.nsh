!macro customUnInstall
  DetailPrint "清理阅读器本地数据..."

  RMDir /r "$APPDATA\阅读器"
  RMDir /r "$LOCALAPPDATA\阅读器"
  RMDir /r "$APPDATA\reader"
  RMDir /r "$LOCALAPPDATA\reader"
  RMDir /r "$LOCALAPPDATA\reader-updater"

  DeleteRegKey HKCU "Software\阅读器"
  DeleteRegKey HKCU "Software\reader"
  DeleteRegKey HKCU "Software\com.electron.reader"
!macroend
