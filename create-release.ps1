$ErrorActionPreference = "Stop"
$token = git config --get github.token
if (-not $token) { Write-Host "No github.token configured"; exit 1 }

$body = @{
    tag_name = "v3.7.2"
    name = "v3.7.2"
    body = "**新功能：记忆系统**`n- Markdown 结构化记忆存储（安装目录/memories/）`n- save_memory / recall_memory / delete_memory 三个工具`n- 自动注入到系统提示词`n`n**文件管理：15个工具**`n- file_list / read / write / edit / rename / delete / copy / search / mkdir / info / open / show`n`n**修复**`n- file_list 权限容错（不再因 System Volume Information 崩溃）`n- memories 路径延迟初始化（避免 app.getPath 提前调用）"
    draft = $false
    prerelease = $false
} | ConvertTo-Json

Write-Host "Creating release..."
$response = Invoke-RestMethod -Uri "https://api.github.com/repos/ydd070622/LingWorks/releases" -Method Post -Body $body -Headers @{
    "Authorization" = "token $token"
    "Accept" = "application/vnd.github.v3+json"
}
Write-Host "Release created: $($response.html_url)"

# Upload asset
$uploadUrl = $response.upload_url -replace '\{.*\}', '?name=LingWorks Setup 3.7.2.exe'
$filePath = "release\LingWorks Setup 3.7.2.exe"
if (Test-Path $filePath) {
    Write-Host "Uploading asset..."
    Invoke-RestMethod -Uri $uploadUrl -Method Post -InFile $filePath -ContentType "application/octet-stream" -Headers @{
        "Authorization" = "token $token"
        "Accept" = "application/vnd.github.v3+json"
    }
    Write-Host "Asset uploaded!"
} else {
    Write-Host "Installer not found: $filePath"
}
