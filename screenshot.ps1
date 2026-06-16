Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$out = Join-Path $env:USERPROFILE 'Desktop\screenshot_test.png'
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
Write-Host "Capturing screen at $($bounds.Width)x$($bounds.Height)"

$bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$gfx.Dispose()
$bmp.Dispose()

Write-Host "Saved to: $out"
$file = Get-Item $out
Write-Host "Size: $([math]::Round($file.Length/1KB, 1)) KB"
