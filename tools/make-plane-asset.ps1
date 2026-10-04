<#
  make-plane-asset.ps1

  ממיר את design/raw/plane-source.jpg לנכס המשחק assets/plane.png:
    1. מסיר את הרקע האחיד (flood-fill מהשוליים פנימה, לא מיפוי צבע גלובלי —
       כי לגוף הלבן של המטוס יש כמעט אותו צבע כמו הרקע; flood-fill שומר
       עליו אטום כי מתאר כהה מפריד ביניהם).
    2. "מצייר מחדש" (inpaint) שני אזורים שצוינו ביד — הכיתוב על הגוף
       והדגל על הזנב — על ידי מילוי כל שורה בצבע הנדגם משני צדי האזור.
       הקואורדינטות נמצאו ע"י בדיקה ידנית של התמונה הספציפית הזו; אם
       התמונה המקורית מוחלפת יש למדוד אותן מחדש (ראו README בתיקיית design).
    3. חותך לתיבה התוחמת של הפיקסלים האטומים (מסיר שוליים ריקים).
    4. שומר PNG עם שקיפות. אין צורך בהיפוך אופקי — המטוס כבר פונה ימינה.

  הרצה (מתיקיית הפרויקט, PowerShell):
    powershell -File tools\make-plane-asset.ps1

  דורש Windows + .NET (System.Drawing) — אין תלות ב-npm/Node לכלי הזה.
#>

Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$SourcePath = Join-Path $ProjectRoot "design\raw\plane-source.jpg"
$OutputPath = Join-Path $ProjectRoot "assets\plane.png"

if (-not (Test-Path $SourcePath)) {
  throw "Source image not found: $SourcePath"
}

# --- הגדרות (לתמונה הספציפית הזו — ראו הערה למעלה) ---
$BgR = 215; $BgG = 215; $BgB = 215
$TightTolerance = 20   # פיקסלים קרובים לרקע מתחת לסף הזה -> רקע ודאי
$LooseTolerance = 40   # להרחבה לפיקסלי שוליים מעורבבים, רק אם צמודים לרקע ודאי
$DilatePasses = 2
$FlipHorizontal = $false  # המטוס במקור כבר פונה ימינה

# אזורי "מחיקה וציור מחדש" (קואורדינטות בתמונת המקור, 1024x741)
$PaintRegions = @(
  @{ Name = "brand text"; X = 358; Y = 345; W = 254; H = 36 },
  @{ Name = "tail flag";  X = 736; Y = 277; W = 56;  H = 50 }
)

Write-Output "Loading $SourcePath ..."
$srcBmp = New-Object System.Drawing.Bitmap $SourcePath
$w = $srcBmp.Width
$h = $srcBmp.Height
Write-Output "Source size: $w x $h"

$work = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($work)
$g.DrawImage($srcBmp, 0, 0, $w, $h)
$g.Dispose()
$srcBmp.Dispose()

$rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
$bd = $work.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$stride = $bd.Stride
$bytes = New-Object byte[] ($stride * $h)
[System.Runtime.InteropServices.Marshal]::Copy($bd.Scan0, $bytes, 0, $bytes.Length)

# --- שלב 1: flood-fill מהשוליים כדי לזהות רקע (לא לפי צבע גלובלי) ---
Write-Output "Flood-filling background from borders..."
$isBg = New-Object bool[] ($w * $h)
$queue = New-Object System.Collections.Generic.Queue[int]

function Test-Enqueue([int]$x, [int]$y) {
  if ($x -lt 0 -or $x -ge $w -or $y -lt 0 -or $y -ge $h) { return }
  $idx1d = $y * $w + $x
  if ($isBg[$idx1d]) { return }
  $pi = ($y * $stride) + ($x * 4)
  $bI = $bytes[$pi]; $gI = $bytes[$pi + 1]; $rI = $bytes[$pi + 2]
  $dr = $rI - $BgR; $dg = $gI - $BgG; $db = $bI - $BgB
  $dist = [math]::Sqrt($dr * $dr + $dg * $dg + $db * $db)
  if ($dist -lt $TightTolerance) {
    $isBg[$idx1d] = $true
    $queue.Enqueue($idx1d)
  }
}

for ($x = 0; $x -lt $w; $x++) { Test-Enqueue $x 0; Test-Enqueue $x ($h - 1) }
for ($y = 0; $y -lt $h; $y++) { Test-Enqueue 0 $y; Test-Enqueue ($w - 1) $y }

while ($queue.Count -gt 0) {
  $idx1d = $queue.Dequeue()
  $cy = [int][math]::Floor($idx1d / $w)
  $cx = $idx1d - ($cy * $w)
  Test-Enqueue ($cx + 1) $cy
  Test-Enqueue ($cx - 1) $cy
  Test-Enqueue $cx ($cy + 1)
  Test-Enqueue $cx ($cy - 1)
}

$bgCount = 0
for ($i = 0; $i -lt $isBg.Length; $i++) { if ($isBg[$i]) { $bgCount++ } }
Write-Output "Background pixels found: $bgCount / $($w*$h)"

# --- שלב 2: הרחבה עדינה (dilation) כדי לנקות שולי אנטי-אליאסינג בלי הילה צבעונית ---
Write-Output "Cleaning antialiased edge fringe..."
for ($iter = 0; $iter -lt $DilatePasses; $iter++) {
  $toMark = New-Object System.Collections.Generic.List[int]
  for ($y = 0; $y -lt $h; $y++) {
    $rowBase = $y * $w
    for ($x = 0; $x -lt $w; $x++) {
      $idx1d = $rowBase + $x
      if ($isBg[$idx1d]) { continue }
      $adjBg = $false
      if ($x -gt 0 -and $isBg[$idx1d - 1]) { $adjBg = $true }
      elseif ($x -lt ($w - 1) -and $isBg[$idx1d + 1]) { $adjBg = $true }
      elseif ($y -gt 0 -and $isBg[$idx1d - $w]) { $adjBg = $true }
      elseif ($y -lt ($h - 1) -and $isBg[$idx1d + $w]) { $adjBg = $true }
      if ($adjBg) {
        $pi = ($y * $stride) + ($x * 4)
        $bI = $bytes[$pi]; $gI = $bytes[$pi + 1]; $rI = $bytes[$pi + 2]
        $dr = $rI - $BgR; $dg = $gI - $BgG; $db = $bI - $BgB
        $dist = [math]::Sqrt($dr * $dr + $dg * $dg + $db * $db)
        if ($dist -lt $LooseTolerance) { $toMark.Add($idx1d) }
      }
    }
  }
  foreach ($idx1d in $toMark) { $isBg[$idx1d] = $true }
  Write-Output "  pass $($iter+1): marked $($toMark.Count) more fringe pixels"
}

# --- שלב 3: החלת אלפא ---
for ($y = 0; $y -lt $h; $y++) {
  $rowBase = $y * $w
  for ($x = 0; $x -lt $w; $x++) {
    $pi = ($y * $stride) + ($x * 4)
    if ($isBg[$rowBase + $x]) { $bytes[$pi + 3] = 0 } else { $bytes[$pi + 3] = 255 }
  }
}

# --- שלב 4: מחיקה וציור מחדש של אזורי הכיתוב/דגל ---
foreach ($region in $PaintRegions) {
  Write-Output "Repainting region: $($region.Name)"
  $rx = $region.X; $ry = $region.Y; $rw = $region.W; $rh = $region.H
  for ($y = $ry; $y -lt ($ry + $rh); $y++) {
    $leftX = $rx - 2
    $rightX = $rx + $rw + 1
    $lpi = ($y * $stride) + ($leftX * 4)
    $rpi = ($y * $stride) + ($rightX * 4)
    $lB = [double]$bytes[$lpi]; $lG = [double]$bytes[$lpi + 1]; $lR = [double]$bytes[$lpi + 2]
    $rB = [double]$bytes[$rpi]; $rG = [double]$bytes[$rpi + 1]; $rR = [double]$bytes[$rpi + 2]
    for ($x = $rx; $x -lt ($rx + $rw); $x++) {
      $t = ($x - $rx) / [double]$rw
      $nr = [byte]([math]::Round($lR + ($rR - $lR) * $t))
      $ng = [byte]([math]::Round($lG + ($rG - $lG) * $t))
      $nb = [byte]([math]::Round($lB + ($rB - $lB) * $t))
      $pi = ($y * $stride) + ($x * 4)
      $bytes[$pi] = $nb
      $bytes[$pi + 1] = $ng
      $bytes[$pi + 2] = $nr
      $bytes[$pi + 3] = 255
      $isBg[($y * $w) + $x] = $false
    }
  }
}

[System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $bd.Scan0, $bytes.Length)
$work.UnlockBits($bd)

# --- שלב 5: חיתוך לתיבה התוחמת של הפיקסלים האטומים ---
Write-Output "Finding content bounding box..."
$minX = $w; $maxX = -1; $minY = $h; $maxY = -1
for ($y = 0; $y -lt $h; $y++) {
  $rowBase = $y * $w
  for ($x = 0; $x -lt $w; $x++) {
    if (-not $isBg[$rowBase + $x]) {
      if ($x -lt $minX) { $minX = $x }
      if ($x -gt $maxX) { $maxX = $x }
      if ($y -lt $minY) { $minY = $y }
      if ($y -gt $maxY) { $maxY = $y }
    }
  }
}
$cropW = $maxX - $minX + 1
$cropH = $maxY - $minY + 1
Write-Output "Content bbox: x[$minX-$maxX] y[$minY-$maxY] -> ${cropW}x${cropH}"

$cropRect = New-Object System.Drawing.Rectangle $minX, $minY, $cropW, $cropH
$cropped = $work.Clone($cropRect, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$work.Dispose()

if ($FlipHorizontal) {
  Write-Output "Flipping horizontally..."
  $cropped.RotateFlip([System.Drawing.RotateFlipType]::RotateNoneFlipX)
}

$outDir = Split-Path -Parent $OutputPath
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }
$cropped.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
$cropped.Dispose()

Write-Output "Saved $OutputPath (${cropW}x${cropH})"
