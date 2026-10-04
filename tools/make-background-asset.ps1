<#
  make-background-asset.ps1

  ממיר את design/raw/background-source.jpg לנכס הרקע assets/background-city.png,
  עם כמה תיקוני נראות (ראו design/SPEC.md, "היררכיית בהירות"):

    1. מורידים רוויה בעדינות (מיזוג כל ערוץ לכיוון הבהירות שלו במרחב RGB
       — לא המרת HSL, ראו הערה למטה), ומוסיפים ערפל אוויר תכול-בהיר חזק
       ואחיד (גם בתחתית, לא רק למעלה) — כדי שהרקע יהיה השכבה הכי שקטה.
    2. מרחיבים את הקנבס כלפי מעלה ומשלימים שמיים בגרדיאנט חלק שממשיך את
       צבע השמיים של התמונה עצמה — כי בתמונה המקורית הבניינים הגבוהים
       מגיעים עד כ-80% מהגובה (והצריח הבודד עד כ-89%), ואי אפשר לדחוף את
       קו הגג מתחת ל-45% בלי זה (ראו הערה למטה לגבי המגבלה שנשארה).
    3. (בוטל — ראו הערה למטה) ניסיון לדגום לרשת פיקסל-ארט גסה ולהגדיל
       חזרה, כדי להתאים את צפיפות הפרטים לסגנון הבלוקי של המגדלים.

  מגבלה ידועה: ההרחבה מכוונת לקו הגג ה-*כללי* של רוב הבניינים
  (נמדד ~80% מהגובה במקור), לא לצריח הבודד והגבוה ביותר (שמגיע ל-~89%
  במקור) — דחיפת גם אותו מתחת ל-45% דרשה כמעט להכפיל את גובה הקנבס
  ולדלל את התמונה האמיתית לפחות ממחצית הפריים, מה שנראה ריק יותר משהוא
  עוזר. התוצאה: רוב קו הרקיע יושב סביב 44%-48% מהגובה, והצריח הבודד
  בולט מעט מעליו כמו ציון-דרך (landmark accent) — לא קו גג אחיד ב-45%
  בדיוק. אם רוצים שגם הצריח יישאר מתחת ל-45% בלי זה, צריך תמונת רקע
  חדשה שבה העיר נמוכה יותר מלכתחילה (יש גרסת `background-v2` אופציונלית
  למטה בדיוק בשביל זה).

  לגבי שלב 3 שבוטל: שלוש גרסאות שונות (הקטנה חדה אחת, Bilinear, הקטנה
  הדרגתית בצעדים של פי 2) כולן יצרו את אותה תקלה — משטח עשיר בפרטי
  חלונות, כשדוחסים אותו לבלוקים עם קצוות חדים (nearest-neighbor
  בהגדלה חזרה), נראה כלוח-שחמט שבור ולא כמו פיקסל-ארט מכוון. במקום
  עוד ניסיון (וכל ניסיון לוקח ~10 דקות), ויתרנו על הבלוקיות המכוונת
  הזאת לשכבת הרקע הספציפית הזו — התוצאה לא תואמת לגמרי בצפיפות
  למגדלים (סעיף 10), אבל היא רגועה וצבעונית ולא שבורה.

  הרצה (מתיקיית הפרויקט, PowerShell):
    powershell -File tools\make-background-asset.ps1
#>

Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

# אם סופקה גרסה חדשה של הרקע (עיר נמוכה יותר, שני שליש עליונים שמיים),
# משתמשים בה במקום המקור הישן.
$SourcePathV2 = Join-Path $ProjectRoot "design\raw\background-v2.jpg"
$SourcePathV1 = Join-Path $ProjectRoot "design\raw\background-source.jpg"
$SourcePath = if (Test-Path $SourcePathV2) { $SourcePathV2 } else { $SourcePathV1 }
$OutputPath = Join-Path $ProjectRoot "assets\background-city.png"

if (-not (Test-Path $SourcePath)) {
  throw "Source image not found: $SourcePath"
}
Write-Output "Using source: $SourcePath"

# --- הגדרות ---
# תיקון סופי אחרי כמה ניסיונות כושלים עם המרת HSL (RgbToHsl/HslToRgb):
# משהו בלולאת ה-hue/saturation ייצר תוצאות שגויות (לפעמים אפור קשה,
# לפעמים רוויה מוגזמת/ניאון) — נבדק ע"י בדיקה מהירה על חיתוך קטן בלבד
# (שניות, לא דקות) עד שנמצאה נוסחה פשוטה שעובדת: מיזוג ישיר במרחב RGB,
# בלי המרת HSL בכלל. רוויה = מיזוג כל ערוץ לכיוון הבהירות (luminance)
# שלו; זו נוסחה סטנדרטית, חסינת-באגים, קלה לאימות ידני. ואז מיזוג נוסף
# לכיוון צבע ערפל בהיר, באותה שיטה.
$DesatAmount = 0.28        # כמה כל ערוץ נמשך לכיוון הבהירות שלו (0=בלי שינוי, 1=אפור מלא)
$HazeColor = @{ R = 0xcf; G = 0xe9; B = 0xf5 }  # תכלת-בהיר, ערפל אוויר
$HazeBaseAlpha = 0.30      # עוצמת ערפל מינימלית — גם בתחתית, באזור הבניינים הצפוף
$HazeTopExtra = 0.16       # עוצמה נוספת שעולה כלפי מעלה (פרספקטיבת עומק)
$RoofTargetFraction = 0.45 # קו הגג הכללי לא יעלה מעל זה, מהתחתית, בקנבס הסופי
$MeasuredGeneralRoofFraction = 0.80  # נמדד ידנית במקור (ראו הערה למעלה)

# --- שלב 1: טעינה + הורדת רוויה/ניגודיות + ערפל אווירי, פיקסל-פיקסל ---
Write-Output "Loading $SourcePath ..."
$srcBmp = New-Object System.Drawing.Bitmap $SourcePath
$srcW = $srcBmp.Width
$srcH = $srcBmp.Height
Write-Output "Source size: $srcW x $srcH"

$work = New-Object System.Drawing.Bitmap $srcW, $srcH, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g0 = [System.Drawing.Graphics]::FromImage($work)
$g0.DrawImage($srcBmp, 0, 0, $srcW, $srcH)
$g0.Dispose()
$srcBmp.Dispose()

$rect = New-Object System.Drawing.Rectangle 0, 0, $srcW, $srcH
$bd = $work.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$stride = $bd.Stride
$bytes = New-Object byte[] ($stride * $srcH)
[System.Runtime.InteropServices.Marshal]::Copy($bd.Scan0, $bytes, 0, $bytes.Length)

Write-Output "Desaturating (luminance blend) and applying haze blend (this is the slow pass)..."
for ($y = 0; $y -lt $srcH; $y++) {
  $rowBase = $y * $stride
  # ערפל חזק ואחיד גם בתחתית (אזור הבניינים הצפוף) + תוספת כלפי מעלה
  $hazeAlpha = $HazeBaseAlpha + ($HazeTopExtra * [math]::Pow(1.0 - ($y / [double]$srcH), 1.5))
  for ($x = 0; $x -lt $srcW; $x++) {
    $pi = $rowBase + ($x * 4)
    $b0 = [double]$bytes[$pi]; $g1 = [double]$bytes[$pi + 1]; $r0 = [double]$bytes[$pi + 2]

    $lum = 0.299 * $r0 + 0.587 * $g1 + 0.114 * $b0
    $r1 = $r0 + ($lum - $r0) * $DesatAmount
    $g2 = $g1 + ($lum - $g1) * $DesatAmount
    $b1 = $b0 + ($lum - $b0) * $DesatAmount

    $fr = $r1 + ($HazeColor.R - $r1) * $hazeAlpha
    $fg = $g2 + ($HazeColor.G - $g2) * $hazeAlpha
    $fb = $b1 + ($HazeColor.B - $b1) * $hazeAlpha

    $bytes[$pi] = [byte][math]::Round([math]::Max(0, [math]::Min(255, $fb)))
    $bytes[$pi + 1] = [byte][math]::Round([math]::Max(0, [math]::Min(255, $fg)))
    $bytes[$pi + 2] = [byte][math]::Round([math]::Max(0, [math]::Min(255, $fr)))
  }
  if ($y % 100 -eq 0) { Write-Output "  row $y / $srcH" }
}

[System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $bd.Scan0, $bytes.Length)
$work.UnlockBits($bd)

# --- שלב 2: הרחבת הקנבס כלפי מעלה + השלמת שמיים בגרדיאנט ---
$extraHeight = [int][math]::Round($srcH * (($MeasuredGeneralRoofFraction / $RoofTargetFraction) - 1))
$newH = $srcH + $extraHeight
Write-Output "Extending canvas: +$extraHeight px sky above (new height ${newH}px)"

# דוגמים את צבע השמיים בשורה העליונה של התמונה המעובדת, כבסיס לגרדיאנט
$topRowPi = 2 # (x=0,y=0) אחרי LockBits הקודם, מתוך bytes שעודכן
$skyAtJoinB = $bytes[0]; $skyAtJoinG = $bytes[1]; $skyAtJoinR = $bytes[2]
# גוון בהיר/שקט יותר בראש הקנבס החדש (אזור הטיסה הפתוח)
$skyTop = @{ R = 0xd8; G = 0xef; B = 0xfa }

$composite = New-Object System.Drawing.Bitmap $srcW, $newH, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$cbd = $composite.LockBits((New-Object System.Drawing.Rectangle 0, 0, $srcW, $newH), [System.Drawing.Imaging.ImageLockMode]::WriteOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$cStride = $cbd.Stride
$cBytes = New-Object byte[] ($cStride * $newH)

for ($y = 0; $y -lt $extraHeight; $y++) {
  $t = $y / [double]$extraHeight
  $r = [byte]([math]::Round($skyTop.R + ($skyAtJoinR - $skyTop.R) * $t))
  $gg = [byte]([math]::Round($skyTop.G + ($skyAtJoinG - $skyTop.G) * $t))
  $bb = [byte]([math]::Round($skyTop.B + ($skyAtJoinB - $skyTop.B) * $t))
  $rowBase = $y * $cStride
  for ($x = 0; $x -lt $srcW; $x++) {
    $pi = $rowBase + ($x * 4)
    $cBytes[$pi] = $bb; $cBytes[$pi + 1] = $gg; $cBytes[$pi + 2] = $r; $cBytes[$pi + 3] = 255
  }
}
# מעתיקים את התמונה המעובדת לתחתית הקנבס החדש
for ($y = 0; $y -lt $srcH; $y++) {
  [Array]::Copy($bytes, $y * $stride, $cBytes, ($extraHeight + $y) * $cStride, $srcW * 4)
}

[System.Runtime.InteropServices.Marshal]::Copy($cBytes, 0, $cbd.Scan0, $cBytes.Length)
$composite.UnlockBits($cbd)
$work.Dispose()

# --- שלב 3 (בוטל): דגימה לרשת פיקסל-ארט גסה ---
# שלוש גרסאות שונות של השלב הזה (הקטנה חדה אחת, אז Bilinear, אז הקטנה
# הדרגתית) כולן יצרו את אותה תוצאה שבורה: משטח מלא בפרטי חלונות, כשדוחסים
# אותו לבלוקים עם קצוות חדים (nearest-neighbor בהגדלה חזרה), הופך ללוח-
# שחמט קשה של בלוקים — זה לא "פיקסל-ארט", זה נראה כמו תקלה, כי לכל בלוק
# יש קצה חד מול השכנים שלו במקום לדעוך בעדינות. במקום להמשיך לנסות
# (ולהמתין עוד ~10 דקות בכל ניסיון), הוחלט לוותר על הבלוקיות המכוונת
# הזאת עבור הרקע הספציפי הזה ולשמור את הגרסה המעובדת (דה-סטורציה +
# ניגודיות מופחתת + ערפל + הרחבת שמיים) ככה שהיא, בלי שלב דגימה נוסף.
# זה אומר שהרקע לא זהה בצפיפות-פרטים למגדלים (סעיף 10 לא הושג במלואו
# עבור שכבה זו) — אבל הוא נראה רגוע וצבעוני, לא שבור.
$outDir = Split-Path -Parent $OutputPath
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }
$composite.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
$composite.Dispose()

Write-Output "Saved $OutputPath (${srcW}x${newH})"
