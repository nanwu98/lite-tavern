$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'

$version = (Get-Content (Join-Path (Get-Location) 'package.json') -Raw | ConvertFrom-Json).version

$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) {
  throw '未找到 .NET Framework 4.x 编译器 (csc.exe)。Windows 10/11 默认自带。'
}

Write-Host '==> 1/4 构建 Web =='
& .\node_modules\.bin\tsc.cmd -p tsconfig.json --noEmit
if ($LASTEXITCODE -ne 0) { throw 'TypeScript 检查失败' }
& .\node_modules\.bin\vite.cmd build
if ($LASTEXITCODE -ne 0) { throw 'Vite 构建失败' }

Write-Host '==> 2/4 打包 Electron（unpacked）=='
& .\node_modules\.bin\electron-builder.cmd --dir --win --x64
if ($LASTEXITCODE -ne 0) { throw 'electron-builder 失败' }

Write-Host '==> 3/4 生成内置资源 zip =='
$zip = Join-Path (Get-Location) 'release\LiteTavern-app.zip'
Remove-Item $zip -Force -ErrorAction SilentlyContinue
$sevenZip = Get-ChildItem "$env:LOCALAPPDATA\electron-builder\Cache" -Recurse -Filter 7za.exe -ErrorAction SilentlyContinue | Select-Object -First 1
Push-Location (Join-Path (Get-Location) 'release\win-unpacked')
if ($sevenZip) {
  & $sevenZip.FullName a -tzip -mx=5 $zip .\* | Out-Null
} else {
  Compress-Archive -Path .\* -DestinationPath $zip -CompressionLevel Optimal
}
Pop-Location

Write-Host '==> 4/4 生成单文件启动器 =='
$out = Join-Path (Get-Location) "release\LiteTavern-$version-win-x64.exe"
Remove-Item $out -Force -ErrorAction SilentlyContinue
& $csc /nologo /target:winexe /platform:anycpu /optimize+ /codepage:65001 `
  "/win32icon:$(Join-Path (Get-Location) 'build\icon.ico')" `
  "/resource:$zip,LiteTavern.app.zip" `
  /r:System.dll /r:System.Core.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll `
  /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll `
  "/out:$out" (Join-Path (Get-Location) 'scripts\Launcher.cs')
if ($LASTEXITCODE -ne 0) { throw 'csc 编译失败' }

Get-Item $out | ForEach-Object { Write-Host "完成：$($_.FullName)（$([math]::Round($_.Length / 1MB, 1)) MB）" }
