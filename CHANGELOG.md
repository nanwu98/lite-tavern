# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.6.4] - 2026-11-17

### Added

- **获取最新模型**：设置 → 模型服务里新增按钮，调用各家 OpenAI 兼容的 `GET {base}/models`
  拉取账号可用的全部模型；弹层里可搜索，只保留对话模型（自动滤掉 embedding、rerank、
  图像/语音模型）。服务商不提供该接口时会说明原因，并继续使用内置推荐列表。
- **对话设置**：每个对话有了独立配置（聊天头部滑杆图标）。可改标题、单独的上下文长度
  （跟随全局 / 64K / 128K / 256K / 1M / 手填），以及背景图——点选上传后铺满聊天区，
  自动压缩到 1920px 以内；**夜间模式会盖一层很淡的暗色蒙版**，亮色模式不加。
- **启动时静默检查更新**：打开应用后台查一次更新，发现新版本时设置按钮右上角亮起小红点；
  设置 → 关于与更新 会直接展示这次的版本号、更新说明和检查时间，不用先点「检查更新」。

### Changed

- **下拉框整体重做**：服务商与模型都换成应用内自绘的选择器（可搜索、方向键上下选择、
  回车确认、模型仍可手输任意 ID），不再使用浏览器原生 `<select>` / `<datalist>`——
  原生控件样式与界面不搭，在 Android WebView 上还经常弹不出来或被键盘挡住。
  弹层按可视区域自动上下翻转，不会被弹窗裁掉；两项控件的高度、圆角、悬停与选中态一致。
- **内置模型清单更新到 2026-11-17**：DeepSeek 改为 `deepseek-flash` / `deepseek-v4-pro`
  （`deepseek-chat`、`deepseek-reasoner` 已于 2026-07-24 停用），并同步千问、智谱、
  Kimi、文心、混元、豆包、硅基流动的最新主力模型，标注了各家为角色扮演调过的专用模型
  （`qwen-plus-character`、`hunyuan-role-latest`、`doubao-seed-character-260628`）。
- 旧设置里保存的 `deepseek-chat` / `deepseek-reasoner` / `deepseek-v4-flash` 会在启动时
  自动迁移到 `deepseek-flash`，不再出现服务端直接 400、看起来像 Key 失效的情况。
- 默认上下文上限改为 1M tokens，对齐当前模型的窗口大小。
- 对话列表与聊天头部改为显示**对话标题**（可在对话设置里改），角色名作为副标签。
- 备份与恢复包含对话标题、上下文长度覆盖和背景图（背景图仅导出内嵌图片，http 链接不导出）。

### Fixed

- 手动创建角色卡时不填角色名就点保存，「请填写角色名」的提示被创建页的弹窗盖住，完全看不到。
  现在提示层挂在 `body` 上并排在弹窗之上，表单顶部还会出现一条 sticky 提示横幅，
  同时把焦点和滚动定位到角色名输入框。
- 模型一栏在手机上点开原生列表时会被键盘与弹窗遮挡、错位；换成自绘选择器后不再出现。

### Notes

- 已在 Windows 单文件 exe 与某品牌手机实机上回归：模型列表拉取、对话背景（深色/浅色）、
  更新红点与关于页面展示、角色卡创建校验提示。
- README 新增「定位与合规声明」：说明本项目只是本地开源学习工具，不提供模型、内容、账号或
  云服务，角色卡与文责均由使用者自行负责，不面向未成年人、不面向应用商店分发。

## [1.6.3] - 2026-11-17

### Fixed

- 1.6.2 的沉浸式在实机（Android 16、屏幕密度 3.25）上把系统栏的物理像素直接当成了 CSS 像素，
  状态栏 152px 被当成 152dp，顶部因此多出约三倍空白。现在先按屏幕密度换算成 dp 再交给界面。
- 手机端 `.chat-view` 仍按 `100dvh` 定高，叠加安全区 padding 后比可视区高出状态栏那一截，
  底部输入框会被裁掉，宽屏下还会多出横向溢出。现在 shell 固定一行网格，子视图用 `height: 100%`。
- 抽屉（对话列表 / 角色卡）改用 `--safe-top` / `--safe-bottom`，内容不再顶到状态栏或手势条下面。

### Notes

- 已在某品牌手机实机上回归：竖屏、横屏（刘海侧）、深色/浅色主题、设置弹窗、抽屉、聊天输入框。

## [1.6.2] - 2026-11-17

### Fixed

- Android 状态栏/导航栏不沉浸：窗口默认不绘制到系统栏后面，状态栏被主题色涂成一条黑边
  （在实机上很明显）。现在 `MainActivity` 开启 edge-to-edge、
  两条系统栏设为透明，并用 `LiteShell` 插件把实测的 insets 通过 `--safe-top` /
  `--safe-bottom` 交给界面自行留白，应用背景（极光渐变）一直延伸到屏幕边缘；
  浅色主题下状态栏图标会自动转为深色。
- 注入的 insets 按「系统栏 + 刘海区」取最大值，横屏和挖孔屏也不会被切掉内容。

### Notes

- 同一套 `WindowInsets` 方案覆盖小米 / HyperOS、OPPO、vivo、荣耀等国产 ROM，无需按品牌
  分支；这也是金标联盟（ITGSA）要求 2026-10-31 前完成的统一导航条适配规范。
- Android 15 起系统强制 edge-to-edge，本实现同时适配目标 SDK 34 的旧行为与新版系统。

## [1.6.1] - 2026-11-17

### Fixed

- 检查更新时会拿到「镜像缓存里的旧清单」：例如 APK 刚替换过，`ghfast.top` 还在返回
  没有 android 项的 `version.json`，下载按钮点了没有反应。现在会跳过缺少当前平台
  安装包的清单、继续试下一个来源；只有全部来源都缺安装包时才提示「去发布页下载」，
  不再出现点了没反应的按钮。

## [1.6.0] - 2026-11-17

### Added

- Model provider picker: DeepSeek、通义千问（阿里云百炼）、智谱 GLM、Kimi（月之暗面）、
  文心一言（百度千帆）、腾讯混元、豆包（火山方舟）、硅基流动，以及「自定义」任意
  OpenAI 兼容接口。选中后会填入 Base URL、常用模型、上下文窗口和申请 Key 的页面。
- 每个服务商的 Key 单独保存（`apiKeys`），切换回来时自动恢复，不用重新粘贴。
- 老版本设置自动迁移：根据已存的 Base URL 识别服务商，原来的 Key 归到该服务商名下。

### Changed

- 设置页不再围绕单一厂商：入口改为「模型服务」，错误提示统一指向「服务商控制台」。
- 自动恢复快照会抹掉**所有**服务商的 Key，而不只是当前那个。
- README 增加各服务商的 Base URL 与模型示例对照表。

### Removed

- 硬编码的默认模型列表和「DeepSeek 驱动」等品牌文案。

## [1.5.0] - 2026-11-17

### Added

- In-app updates (设置 → 关于与更新) for both the Windows single-file build and the
  Android APK: the app reads `version.json` from the latest GitHub release, shows
  the release notes and installer size, downloads through GitHub (falling back to
  public mirrors), verifies the published SHA-256, and then either swaps the
  launcher and restarts (Windows) or opens the system installer (Android).
- `scripts/make-version-manifest.mjs` plus a tag-driven release workflow that
  builds both installers, publishes them together with `version.json`, and keeps
  the manifest hashes in sync with the published binaries.

### Changed

- The Windows launcher exports `LITE_TAVERN_LAUNCHER` and `LITE_TAVERN_HOME`, so
  the app can replace the launcher it was started from, and deletes the `.old`
  copy left behind after an update.
- Android asks for `REQUEST_INSTALL_PACKAGES`; installation still needs an
  explicit confirmation from the user.

### Notes

- 1.4.0 及更早的版本没有内置更新器，老用户需要手动安装一次 1.5.0；从 1.5.0 起
  Windows 与 Android 都能自己检查并安装后续版本。

## [1.4.0] - 2026-11-17

### Added

- Context compaction: the oldest messages are summarized into a rolling "story
  memory" that is sent instead of the full transcript, with a settings toggle for
  automatic compaction at 80% of the configured context window.
- Context meter in the chat header, a dialog that shows the stored memory and
  lets you compact or clear it, and a "compact and continue" button on replies
  rejected with `context_length_exceeded`.
- The start screen lists every card, and each one has a ✕ that deletes it after a
  confirmation step.
- Backup & restore: choose cards and/or chat history, export a timestamped JSON
  file, and import it again on Windows or Android. Imports merge, so existing
  cards, books and chats are skipped instead of duplicated; API keys and settings
  are never included.
- Automatic recovery snapshot: the newest library is written next to the profile
  (and to app-private storage on Android) so a damaged IndexedDB is restored on
  the next launch instead of silently starting empty.
- "Warm dusk glass" visual refresh: layered aurora background, frosted panels
  with hairline highlights, softer bubbles, refined typography, and slower
  entrance/hover motion that respects `prefers-reduced-motion`.

### Fixed

- Launching the unpacked `LiteTavern.exe` from `LiteTavernData\<version>\` opened
  an empty profile instead of the launcher's data. Portable installs are now
  detected by the app itself, and the launcher reuses an existing install
  directory when upgrading.
- Deleting the current conversation asked for confirmation twice.
- A stale crash copy in `localStorage` could take precedence over newer data;
  it is now only used when it actually contains a card or a conversation.
- The Windows package accidentally bundled Android build folders pulled in by the
  new Capacitor plugins, which made self-extraction fail with "path too long".
- The aurora background could create a hidden horizontal scroll area that shifted
  the layout when a dialog opened.
- `scripts/build-*.ps1` were saved without a UTF-8 BOM, so Windows PowerShell 5.1
  could fail to parse their Chinese messages.
- Removed the hard-coded version from the build scripts; they read
  `package.json` now.

### Changed

- Hidden history limit raised to 400k characters; compaction, the configured
  message count and the provider window are what bound a request now.
- Settings shows the data directory and can open it (desktop).
- Unit tests run in worker threads, which also works where spawning child
  processes is restricted.
- Android backup export goes through the system share sheet (Files, Drive,
  WeChat, …); Windows uses a native save dialog.

## [1.3.0] - 2026-11-17

### Added

- Dark / light / follow-system theme for desktop and Android.
- Desktop boss key: a configurable global shortcut hides and restores the window.
- Manual character cards: avatar, name, note, system prompt and opening message,
  with no file import required.
- Editing existing character cards (name, note, avatar, prompt, opening).
- Manual world books: create a book, add/edit/delete entries, attach it to a card.
- Editing imported world books from the read-only viewer.
- Chinese and English READMEs, contribution and security guidelines.

### Changed

- Card list shows the note field and marks cards that contain scripts.
- Android build script auto-detects the SDK/JDK and reads signing settings from
  `android/keystore.properties` (git-ignored) or environment variables.

## [1.2.0] - 2026-11-16

### Added

- Multiple opening messages: `alternate_greetings` become swipe variants.
- Regenerating an AI reply adds a new variant instead of overwriting it.
- Inline editing for every message in the history; edits are sent to the model.
- Swipe controls (`‹ 1/3 ›`) for user and assistant messages.

## [1.1.0] - 2026-11-16

### Added

- Rendering of card-provided HTML/JS front-ends in isolated iframes.
- Tavern-Helper / JS-Slash-Runner compatible script runtime: `TavernHelper`,
  `SillyTavern.getContext()`, variables, events, chat messages, slash commands,
  `Mvu`, `z`, `YAML` and script buttons.
- Script-rendered status bars and floating windows, MVU variable updates.
- SillyTavern regex scripts (display/prompt passes, depth limits, trimStrings).
- Settings toggle to disable card code execution.

## [1.0.2] - 2026-11-15

### Fixed

- Android WebView could clear the API key input on display/hide or connection
  test; the key field is now uncontrolled and persisted on blur/success.
- Older WebView builds could show a blank screen; the bundle targets ES2019.

## [1.0.1] - 2026-11-15

### Fixed

- API key was lost when testing the connection and saving on Android.

## [1.0.0] - 2026-11-14

### Added

- Initial release: three-column UI, PNG/JSON card import, automatic world book
  import, DeepSeek-compatible streaming chat, local persistence, Windows
  single-file executable and signed Android APK.
