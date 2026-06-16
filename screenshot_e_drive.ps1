$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class Win {
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassNameW(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);
}
"@

# 1) Open a fresh E: window
Write-Host "Opening E:\ in a new maximized window..."
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = 'explorer.exe'
$psi.Arguments = '/e, E:\'
[System.Diagnostics.Process]::Start($psi) | Out-Null
Start-Sleep -Seconds 4

# 2) Find the E: cabinet window
$target = [IntPtr]::Zero
$targetTitle = ''
$cb = [Win+EnumWindowsProc]{
    param($hWnd, $lParam)
    $cls = New-Object System.Text.StringBuilder 256
    [Win]::GetClassNameW($hWnd, $cls, 256) | Out-Null
    if ($cls.ToString() -ne 'CabinetWClass') { return $true }
    $len = [Win]::GetWindowTextLength($hWnd)
    if ($len -eq 0) { return $true }
    $sb = New-Object System.Text.StringBuilder ($len + 1)
    [Win]::GetWindowTextW($hWnd, $sb, $sb.Capacity) | Out-Null
    $title = $sb.ToString()
    if ($title -match 'E[:]') {
        $script:target = $hWnd
        $script:targetTitle = $title
    }
    return $true
}
[Win]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
if ($target -eq [IntPtr]::Zero) { Write-Error "E drive window not found"; exit 1 }
Write-Host "Target: '$targetTitle' hWnd=$target"

# 3) Maximize it (force SW_MAXIMIZE) and try to foreground
[Win]::ShowWindow($target, 3) | Out-Null
[Win]::SetForegroundWindow($target) | Out-Null
Start-Sleep -Seconds 2

# 4) List every screen and capture each one separately
$desktop = "$env:USERPROFILE\Desktop"
$idx = 0
foreach ($screen in [System.Windows.Forms.Screen]::AllScreens) {
    $idx++
    $b = $screen.Bounds
    $out = Join-Path $desktop "e_drive_screen$idx.png"
    Write-Host "Screen $idx : $($screen.DeviceName) Bounds=($($b.X),$($b.Y),$($b.Width),$($b.Height)) -> $out"
    $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
    $gfx = [System.Drawing.Graphics]::FromImage($bmp)
    $gfx.CopyFromScreen($b.X, $b.Y, 0, 0, $b.Size)
    $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $gfx.Dispose()
    $bmp.Dispose()
    $file = Get-Item $out
    Write-Host "  saved $([math]::Round($file.Length/1KB, 1)) KB"
}

# 5) Bonus: stitch all screens into one wide image
$screens = @([System.Windows.Forms.Screen]::AllScreens)
$minX = ($screens | Measure-Object -Property { $_.Bounds.X } -Minimum).Minimum
$minY = ($screens | Measure-Object -Property { $_.Bounds.Y } -Minimum).Minimum
$maxX = ($screens | Measure-Object -Property { $_.Bounds.X + $_.Bounds.Width } -Maximum).Maximum
$maxY = ($screens | Measure-Object -Property { $_.Bounds.Y + $_.Bounds.Height } -Maximum).Maximum
$totalW = $maxX - $minX
$totalH = $maxY - $minY
$outAll = Join-Path $desktop "e_drive_all_screens.png"
Write-Host "Stitching all screens: ${totalW}x${totalH} -> $outAll"
$bmpAll = New-Object System.Drawing.Bitmap $totalW, $totalH
$gfxAll = [System.Drawing.Graphics]::FromImage($bmpAll)
foreach ($screen in $screens) {
    $b = $screen.Bounds
    $tmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
    $gtmp = [System.Drawing.Graphics]::FromImage($tmp)
    $gtmp.CopyFromScreen($b.X, $b.Y, 0, 0, $b.Size)
    $gfxAll.DrawImage($tmp, ($b.X - $minX), ($b.Y - $minY))
    $gtmp.Dispose()
    $tmp.Dispose()
}
$bmpAll.Save($outAll, [System.Drawing.Imaging.ImageFormat]::Png)
$gfxAll.Dispose()
$bmpAll.Dispose()
$fileAll = Get-Item $outAll
Write-Host "Stitched: $([math]::Round($fileAll.Length/1KB, 1)) KB"

Write-Host "DONE."
