<#
  make-background-asset.ps1

  ממיר את design/raw/background-source.jpg לנכס הרקע assets/background-city.png.

  בניגוד למטוס, אין כאן הסרת רקע — זו תמונת רקע אטומה שממלאת את כל גובה
  אזור המשחק, אז כל מה שצריך הוא המרה ל-PNG (ללא דחיסה הרסנית נוספת).

  בדקנו ידנית את התמונה הזו: אין בה קו חיתוך נקי בין "עיר" ל"כביש" (הרחוב
  מצטייר בפרספקטיבה עם חזיתות חנויות כמעט עד לשוליים התחתונים ממש), ולכן
  נשמרת שכבה אחת בלבד — background-city.png. אם מחליפים בתמונה חדשה שבה
  יש רצועת כביש אופקית נקייה בתחתית, אפשר להוסיף כאן חיתוך לשתי שכבות
  (ראו ההערה למטה, PlaneAsset tools/make-plane-asset.ps1 מדגים טכניקת
  מחיקה/חיתוך דומה).

  הרצה (מתיקיית הפרויקט, PowerShell):
    powershell -File tools\make-background-asset.ps1
#>

Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$SourcePath = Join-Path $ProjectRoot "design\raw\background-source.jpg"
$OutputPath = Join-Path $ProjectRoot "assets\background-city.png"

if (-not (Test-Path $SourcePath)) {
  throw "Source image not found: $SourcePath"
}

Write-Output "Loading $SourcePath ..."
$srcBmp = New-Object System.Drawing.Bitmap $SourcePath
Write-Output "Size: $($srcBmp.Width) x $($srcBmp.Height)"

$outDir = Split-Path -Parent $OutputPath
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }

$srcBmp.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
$srcBmp.Dispose()

Write-Output "Saved $OutputPath"
