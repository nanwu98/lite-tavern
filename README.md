# 轻语酒馆 · LiteTavern

<p align="center">
  <img src="docs/desktop.png" alt="LiteTavern 桌面端" width="900" />
</p>

<p align="center">
  只做「角色卡 + 世界书聊天」的极简本地客户端 · Windows / Android
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg" /></a>
  <a href="https://github.com/nanwu98/lite-tavern/releases"><img alt="Release" src="https://img.shields.io/github/v/release/nanwu98/lite-tavern?include_prereleases" /></a>
  <a href="https://github.com/nanwu98/lite-tavern/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/nanwu98/lite-tavern/actions/workflows/ci.yml/badge.svg" /></a>
  <a href="README.en.md">English</a> · 简体中文
</p>

---

## 这是什么

导入一张酒馆角色卡（PNG / JSON），卡内嵌的世界书会自动挂载，选一张卡就能开聊。
没有卡片编辑器（但可以手写）、没有群聊、没有插件市场、没有云同步——只把故事讲好。

- 左侧对话列表，中间聊天，右侧角色卡。
- 数据全部保存在本机；API Key 只存在本机，只发送到你填写的接口地址。
- 内置 DeepSeek 兼容的流式客户端，也可以接任何 OpenAI 兼容接口。

## 功能

- **角色卡**：导入 PNG / JSON（`chara_card_v2/v3`、旧版平铺格式），或**手动创建**一张卡，只填头像、名字、备注、系统提示词和开场白；已导入的卡也能随时编辑。启动页会列出本机全部角色卡，卡片右上角的 **✕** 二次确认后即可删除。
- **世界书**：随卡自动挂载；支持手动导入、**手动创建**、在应用内添加/修改/删除词条，以及编辑已导入的世界书。
- **开场白与版本**：`first_mes` + `alternate_greetings` 变成可左右切换的开场；重新生成 AI 回复会追加新版本而不是覆盖；用户和 AI 的历史消息都能直接编辑，修改后会作为真实历史发给模型。
- **上下文压缩（1.4.0 起）**：长对话会把最早的一批消息交给模型总结成一段「长期记忆」，之后只发送「记忆 + 最近几条消息」，省下大量上下文又不忘剧情。设置里可开**自动压缩上下文**（达到上限 80% 时自动触发），聊天头部也能看到当前用量并手动压缩；如果关掉自动压缩、真的被服务端以「上下文超限」拒绝，失败的消息里会出现**一键压缩上下文并继续对话**按钮，点一下就走同一套压缩流程。
- **备份与恢复**：设置 → 备份与恢复，勾选「角色卡（含世界书）」和/或「聊天记录（含对应角色卡）」，导出带时间戳的 JSON 备份；换设备或重装后导入同一个文件即可恢复。Windows 与 Android 之间互通，导入是**合并**而不是覆盖。
- **角色卡代码（1.1.0 起）**：卡里用酒馆助手 / JS-Slash-Runner 写的 HTML + JS 会在隔离 iframe 中运行——角色创建表单、状态栏、悬浮窗、MVU 变量更新都能工作。可在设置里整体关闭。
- **应用内更新（1.5.0 起）**：设置 → **关于与更新** 一键检查新版本，显示更新说明与安装包大小；下载后先用清单里的 SHA-256 校验再安装——Windows 会替换启动器并自动重启，Android 会调起系统安装器（需要你确认一次）。
- **外观**：深色 / 亮色 / 跟随系统，「暖暮柔光玻璃」界面：分层极光背景、磨砂面板、柔和光晕与克制的入场动效；低配 WebView 会自动退回不透明的实色面板。
- **老板键（桌面版）**：自定义全局快捷键，一键隐藏 / 恢复窗口。
- **模型**：DeepSeek 或任意 OpenAI 兼容服务，流式输出、温度、上下文长度、世界书预算可调。

## 截图

| 深色                  | 亮色                        |
| --------------------- | --------------------------- |
| ![](docs/desktop.png) | ![](docs/desktop-light.png) |

| 启动页（全部角色卡）  | 备份与恢复           | 世界书编辑                     |
| --------------------- | -------------------- | ------------------------------ |
| ![](docs/welcome.png) | ![](docs/backup.png) | ![](docs/worldbook-editor.png) |

<p align="center">
  <img src="docs/mobile.png" width="300" alt="手机端聊天" />
  <img src="docs/mobile-chats.png" width="300" alt="手机端对话列表" />
</p>

## 下载与安装

在仓库的 [**Releases**](https://github.com/nanwu98/lite-tavern/releases) 页面下载：

- Windows 10/11 x64：`LiteTavern-<version>-win-x64.exe`（单文件，首次启动解压到 `%LOCALAPPDATA%\LiteTavern\<版本>`）。
- Android 8.0+：`LiteTavern-<version>.apk`（已签名，可直接侧载）。

> 安装包由本地密钥签名；仓库不包含任何签名密钥。自行构建见下文。

### 关于解压出来的 `LiteTavern.exe`

单文件 exe 第一次运行会把程序解压到 `%LOCALAPPDATA%\LiteTavern\<版本>\`（无法写入时退回到 exe 同级的 `LiteTavernData\<版本>\`），
然后在同级创建 `UserData\` 保存角色卡、世界书与对话。**直接双击 `LiteTavern.exe` 和双击单文件 exe 用的是同一份数据**：
1.4.0 起解压出的程序会自己识别便携目录（`UserData\` / `.lite-tavern-portable`），
旧版本因为少了这个判断，会去 `%APPDATA%` 另开一个空配置，所以看起来“卡没了”。

设置 → 存储位置 里能看到当前数据目录，并一键打开它；升级新版本时启动器也会沿用已有的安装目录，不会把旧数据丢在别处。

## 从源码构建

需要 Node.js 22.13+、pnpm 11。

```bash
pnpm install
pnpm dev          # 开发模式 http://localhost:5173
pnpm build        # 类型检查 + 打包 Web
pnpm test         # 单元测试
pnpm test:e2e     # Playwright 端到端测试（会启动本地 mock 模型服务）
```

### Windows 单文件 exe

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-windows.ps1
```

产物：`release/LiteTavern-<version>-win-x64.exe`。需要 .NET Framework 4.x（Windows 自带）。

### Android APK

需要 JDK 17+ 与 Android SDK（`platforms;android-34`、`build-tools;34.0.0`）。
脚本会自动探测 `JAVA_HOME` / `ANDROID_HOME`。

```powershell
$env:LITE_TAVERN_KEYSTORE_PASS = '你的签名密码'   # 可选
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-android.ps1
```

签名密钥不会被提交：

- 不配置时，首次构建会在 `android/lite-tavern.keystore` 生成一个本地密钥（默认密码 `lite-tavern-dev`）。
- 也可以在 `android/keystore.properties`（已被 git 忽略）或环境变量
  `LITE_TAVERN_KEYSTORE` / `LITE_TAVERN_KEYSTORE_PASS` / `LITE_TAVERN_KEY_ALIAS` 中配置。
- 想覆盖安装旧版本，请保留并复用同一个密钥。

### 发布新版本

```bash
node scripts/bump-version.mjs 1.5.0   # 同步 package.json、Android versionCode/versionName、启动器版本
# 在 CHANGELOG.md 写一段 ## [1.5.0]（发布说明会自动取这一段）
git commit -am "release: 1.5.0" && git tag v1.5.0 && git push origin main --tags
```

打 tag 后 `Release` 工作流会构建 exe / APK、生成 `version.json`（含文件名、大小、SHA-256）
并创建 GitHub Release。Android 自动构建需要这三个仓库 Secrets：
`ANDROID_KEYSTORE_BASE64`、`ANDROID_KEYSTORE_PASS`、`ANDROID_KEY_ALIAS`；
没配置时只发布 Windows 版本，APK 仍可用 `pnpm android:build` 在本地出包后手动上传。

## 使用

1. 打开设置，填写 API Key、Base URL（默认 `https://api.deepseek.com`）和模型名，点「测试连接」后保存。
2. 右侧「导入」选择 PNG / JSON 角色卡，或点「新建」手写一张。
3. 卡内嵌世界书会自动挂载；也可以在卡片菜单里导入、新建或编辑世界书。
4. 点角色卡开始聊天。消息下方的 `‹ 1/3 ›` 切换开场或重新生成的版本，铅笔图标编辑历史消息。
5. 设置里可以切换深色 / 亮色 / 跟随系统；桌面版还能设置老板键。
6. 启动页（没有选中对话时）会列出全部角色卡，右上角的 **✕** 点一次会弹确认，确认后删除该卡及其对话。
7. 设置 → 备份与恢复：勾选要备份的内容，导出带时间戳的 JSON；换设备后在同一个入口导入即可。

### 检查更新

<p align="center">
  <img src="docs/update.png" width="680" alt="设置里的「关于与更新」" />
</p>

- 设置 → 关于与更新 → **检查更新**。版本清单是随 Release 一起发布的 `version.json`，
  通过 `releases/latest/download/...` 读取，不消耗 GitHub API 配额。
- 直连 `github.com` 失败会自动改走 `ghfast.top` / `ghproxy.net` 镜像；下载完成后用清单里
  的 SHA-256 校验，被镜像篡改的包会被直接丢弃。
- **Windows**：下载 → 校验 → 替换启动器（旧文件改名 `.old`，下次启动自动清理）→ 自动重启。
  角色卡、对话与设置都在 `UserData` 里，升级不会丢。
- **Android**：下载 → 校验 → 调起系统安装器。首次需要在系统设置里允许「轻语酒馆」
  安装未知应用；Android 不允许应用静默安装，最后一步始终由你确认。
- 只有你点「检查更新」时才会联网，应用平时不会主动请求任何服务器。
- 1.4.0 及更早的版本还没有更新器，需要手动安装一次 1.5.0；之后两端都能自己升级。

### 备份与恢复

- 备份文件是可读的 JSON，文件名形如 `LiteTavern-backup-2026-11-17-1030.json`。
- **Windows 与 Android 通用**：把一个平台导出的文件拿到另一个平台导入即可（除非将来的格式有破坏性变更）。
- 桌面版弹出系统保存对话框；Android 会写入应用缓存并打开系统分享面板，可保存到「文件 / 下载 / 网盘 / 微信」。
- 导入会**合并**：按 id（以及同名 + 同创建时间）去重，已存在的角色卡、世界书和对话直接跳过，不会覆盖或删除本机数据。
- 备份包含角色卡、世界书（含词条）、聊天记录与已压缩的「记忆」；**不包含** API Key、Base URL 等设置。
- 应用还会把最新数据自动写一份本地快照（桌面版在数据目录的 `lite-tavern-autosave.json`）。
  如果 IndexedDB 因为强制关机、断电等原因损坏导致角色卡消失，下次启动会自动从这份快照恢复，并提示「已从自动快照恢复」。
  主动删光所有角色卡时快照会一起清除，不会被“复活”。

### 上下文压缩

- 聊天头部的百分比按钮显示这一轮大概要用多少上下文；点开可以看到上限、自动压缩阈值和已经压缩出来的「记忆」。
- 设置 → 上下文压缩：填写模型的上下文上限（`64K / 128K / 256K` 快捷选项，以官方文档为准），并可开启**自动压缩上下文**。
  开启后，当估算用量达到上限的 80%，发送前会先把最早的一批消息总结成记忆，再继续对话。
- 关闭自动压缩时，一旦服务端真的返回 `context_length_exceeded`，失败的消息里会出现**一键压缩上下文并继续对话**按钮，
  它会调用同一套压缩逻辑，然后自动重试这一轮。

### 角色卡代码

带代码的卡（酒馆助手 / JS-Slash-Runner）会在隔离 iframe 中拿到 `TavernHelper`、
`SillyTavern.getContext()`、变量、事件、`getChatMessages`、`triggerSlash`、`generateRaw`、
`Mvu`、`z`、`YAML` 等兼容接口。设置 → 角色卡代码 可以整体关闭执行。

## 数据与隐私

- 角色卡、世界书、对话、变量都存在本机（IndexedDB），没有账号、没有云同步、没有遥测。
- API Key 明文保存在本机应用存储里，只发送到你填写的 Base URL。
- 卡里的脚本等同于任意代码，请只导入你信任来源的角色卡。

## 已知限制

- 依赖 CDN 的卡内脚本（MVU、pinia 等）需要联网；离线时依赖它们的页面不可用。
- 卡里的 EJS 模板（`<%_ … _%>`）不会渲染，会按原文进入提示词。
- 酒馆助手 API 覆盖常用子集，音频、预设、世界书编辑等偏门接口是占位实现。
- Android 上角色卡代码需要较新的系统 WebView（Chromium 89+，Android 11 以后基本满足）。

## 开发与测试

```
src/                React 界面、状态与角色卡/世界书逻辑
src/lib/tavern/     酒馆助手兼容的脚本运行时（iframe 桥）
electron/           Electron 主进程与 preload
android/            Capacitor Android 工程
scripts/            构建脚本、启动器源码
tests/              Vitest 单元测试与 Playwright 端到端测试
docs/               README 使用的截图
```

提交前请跑通 `pnpm test` 与 `pnpm test:e2e`，详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 致谢

- 角色卡 / 世界书格式与正则语义参考 [SillyTavern](https://github.com/SillyTavern/SillyTavern)。
- 卡内脚本接口对齐 [JS-Slash-Runner（酒馆助手）](https://github.com/N0VI028/JS-Slash-Runner) 与 [MagVarUpdate（MVU）](https://github.com/MagicalAstrogy/MagVarUpdate)。
- 使用 React、Vite、Zustand、Electron、Capacitor、marked、DOMPurify 等开源项目，遵循各自许可证。

## 许可证

[MIT](LICENSE) © LiteTavern contributors
