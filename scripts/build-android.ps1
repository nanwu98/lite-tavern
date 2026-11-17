$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

$version = (Get-Content (Join-Path (Get-Location) 'package.json') -Raw | ConvertFrom-Json).version

function Find-Jdk {
  if ($env:JAVA_HOME -and (Test-Path (Join-Path $env:JAVA_HOME 'bin\java.exe'))) {
    return $env:JAVA_HOME
  }
  $roots = @(
    (Join-Path $env:USERPROFILE '.jdks'),
    (Join-Path $env:LOCALAPPDATA 'Programs\Android Studio\jbr'),
    'C:\Program Files\Java',
    'C:\Program Files\Eclipse Adoptium',
    'C:\Program Files\Microsoft'
  )
  foreach ($root in $roots) {
    if (-not (Test-Path $root)) { continue }
    $jdk = Get-ChildItem $root -Directory -ErrorAction SilentlyContinue |
      Where-Object { Test-Path (Join-Path $_.FullName 'bin\java.exe') } |
      Sort-Object Name -Descending |
      Select-Object -First 1
    if ($jdk) { return $jdk.FullName }
  }
  return $null
}

function Find-AndroidSdk {
  $candidates = @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, 'C:\Android\sdk', (Join-Path $env:LOCALAPPDATA 'Android\Sdk'))
  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path (Join-Path $candidate 'platform-tools'))) { return $candidate }
  }
  return $null
}

$sdk = Find-AndroidSdk
if (-not $sdk) { throw '未找到 Android SDK：请设置 ANDROID_HOME 或安装 Android SDK（需 platform-tools / build-tools / platforms;android-34）' }
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk

$jdk = Find-Jdk
if (-not $jdk) { throw '未找到 JDK 17+：请设置 JAVA_HOME 或安装 JDK 17' }
$env:JAVA_HOME = $jdk

$buildTools = Get-ChildItem (Join-Path $sdk 'build-tools') -Directory -ErrorAction SilentlyContinue |
  Sort-Object Name -Descending |
  Select-Object -First 1
if (-not $buildTools) { throw "未找到 build-tools：$sdk\build-tools" }

# Signing key is intentionally not committed. Set LITE_TAVERN_KEYSTORE(_PASS/_ALIAS)
# or create android/keystore.properties (git-ignored) for release builds.
# Without configuration the script generates a local, throwaway key on first run.
$ks = if ($env:LITE_TAVERN_KEYSTORE) { $env:LITE_TAVERN_KEYSTORE } else { Join-Path (Get-Location) 'android\lite-tavern.keystore' }
$storePass = if ($env:LITE_TAVERN_KEYSTORE_PASS) { $env:LITE_TAVERN_KEYSTORE_PASS } else { 'lite-tavern-dev' }
$keyAlias = if ($env:LITE_TAVERN_KEY_ALIAS) { $env:LITE_TAVERN_KEY_ALIAS } else { 'lite-tavern' }

$propsFile = Join-Path (Get-Location) 'android\keystore.properties'
if (Test-Path $propsFile) {
  Get-Content $propsFile | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z0-9_.-]+)\s*=\s*(.+?)\s*$') {
      switch ($matches[1]) {
        'storeFile' { if (-not $env:LITE_TAVERN_KEYSTORE) { $ks = $matches[2] } }
        'storePassword' { if (-not $env:LITE_TAVERN_KEYSTORE_PASS) { $storePass = $matches[2] } }
        'keyAlias' { if (-not $env:LITE_TAVERN_KEY_ALIAS) { $keyAlias = $matches[2] } }
      }
    }
  }
}

Write-Host '==> 1/4 构建 Web =='
& .\node_modules\.bin\tsc.cmd -p tsconfig.json --noEmit
if ($LASTEXITCODE -ne 0) { throw 'TypeScript 检查失败' }
& .\node_modules\.bin\vite.cmd build
if ($LASTEXITCODE -ne 0) { throw 'Vite 构建失败' }

Write-Host '==> 2/4 同步 Capacitor =='
& .\node_modules\.bin\cap.cmd sync android
if ($LASTEXITCODE -ne 0) { throw 'Capacitor 同步失败' }

Write-Host '==> 3/4 Gradle assembleRelease =='
Push-Location android
& .\gradlew.bat assembleRelease --no-daemon
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'Gradle 构建失败' }
Pop-Location

Write-Host '==> 4/4 对齐并签名 APK =='
$apkIn = Join-Path (Get-Location) 'android\app\build\outputs\apk\release\app-release-unsigned.apk'
$aligned = Join-Path (Get-Location) 'tmp\LiteTavern-aligned.apk'
$out = Join-Path (Get-Location) "release\LiteTavern-$version.apk"
New-Item -ItemType Directory -Force -Path (Join-Path (Get-Location) 'tmp') | Out-Null

if (-not (Test-Path $ks)) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ks) | Out-Null
  Write-Host "未找到签名密钥，生成新的本地密钥：$ks"
  & "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -v -keystore $ks -alias $keyAlias `
    -keyalg RSA -keysize 2048 -validity 10000 -storepass $storePass -keypass $storePass `
    -dname 'CN=LiteTavern, O=LiteTavern, C=CN'
  if ($LASTEXITCODE -ne 0) { throw 'keytool 生成密钥失败' }
}

& "$($buildTools.FullName)\zipalign.exe" -f -p 4 $apkIn $aligned
if ($LASTEXITCODE -ne 0) { throw 'zipalign 失败' }
& "$($buildTools.FullName)\apksigner.bat" sign --ks $ks --ks-key-alias $keyAlias `
  --ks-pass "pass:$storePass" --key-pass "pass:$storePass" --out $out $aligned
if ($LASTEXITCODE -ne 0) { throw 'apksigner 失败' }
& "$($buildTools.FullName)\apksigner.bat" verify --verbose $out

Get-Item $out | ForEach-Object { Write-Host "完成：$($_.FullName)（$([math]::Round($_.Length / 1MB, 2)) MB）" }
