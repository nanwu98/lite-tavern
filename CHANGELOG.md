# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.8.1] - 2026-11-24

### Fixed

- **手机输入法在输入框里「点一下没反应，松开才有反应」**：之前 Android 壳层开着
  Capacitor 的 `captureInput`，WebView 拿到的是一段脱离页面的输入连接
  （`BaseInputConnection`）。输入法打拼音时，组合中的字母和候选到不了输入框，
  只能等选定词语、整字提交后一次性出现；长按删除键再上滑「清空」的指令也被吞掉。
  现在关掉它，改回 WebView 自带的输入连接，组合输入、长按连删、上滑清空都恢复成
  和其他 App 一样。
- **提示词、开场白这些长文本输入框用输入法剪贴板粘不进去**：这些框只有 React 的
  受控值，没有聊天输入框那套「原生事件 + 聚焦轮询」兜底。输入法直接写进 DOM 的
  文字 React 并不知道，下一次重渲染就被旧值覆盖，表现为「粘贴了但没进去」。
  现在角色卡的提示词 / 开场白、设置里的「你的设定」、世界书词条内容都接上了同一套
  同步；同步在 IME 组词期间主动让路，不会反过来打断删除和粘贴。

### Notes

- 兜底同步在组合输入（`compositionstart` 到 `compositionend`）期间不再回写，
  这样即使个别输入法仍然不发 `input`，也不会打断长按删除和剪贴板粘贴。
- 单测 134 项全过（新增 4 项输入框同步回归）；已在某品牌手机实机上回归：输入法
  打字与联想、长按删除键连删、上滑清空输入框。

## [1.8.0] - 2026-11-19

### Changed — UI 大改版

- **整体换了一套视觉**：从「暖色玻璃 + 极光」改成安静的纸面。中性色换成暖灰
  （浅色是纸，深色是夜读），全屏只留一个朱砂强调色，用在主按钮、选中态和台词上。
  极光背景、毛玻璃面板、渐变文字、呼吸和漂浮动画全部去掉。
- **长对话改成正文排版**：角色的话不再包在气泡里，而是直接排在页面上，行距放宽；
  只有你自己发的那一句是紧凑的浅色气泡。这样一屏能读到更多正文，长对话不再像
  一串卡片。
- **台词有记号**：被引号包住的台词改用朱砂色，下面压一条极细的同色线——像把剧本
  里的台词划出来。这是全篇唯一带线的文字。
- **起始页重排**：标题、一句说明、角色卡墙、下面三个事实（格式 / 世界书 / 存放），
  全部左对齐，整块内容在窗口里居中；手机上也保持同样的顺序，不再是一大块空白
  中间放两个按钮。
- **图标统一**：全部改成 1.5px 线性图标；品牌标志从渐变圆角块 + 星星改成单色
  对话气泡；设置里的星星图标、对话列表空状态的星星、提示条的星星都撤掉了。
- **头像不再随机配色**：原先按名字哈希出绿、靛、酒红等不同底色，现在统一中性底，
  靠名字区分。
- **字号与圆角收敛**：正文 14.5px、行高 1.86，元信息 11–12px；圆角按控件 8、
  卡片 10、面板 12–14 取值，不再出现 18–22px 的大圆角。
- **动效收敛**：只保留悬停与进入的短过渡（140ms / 260ms，同一条缓动），去掉循环
  动画、悬浮位移和 `filter` 亮度变化。
- **顶栏与提示**：对话设置、上下文占用等按钮排布重新对齐；提示条从右上角移到
  输入框上方，不再挡住顶栏按钮。
- **角色卡栏**：标题副行不再折成三行（只显示「6 张」），「新建 / 导入」不再被挤出
  面板边缘。
- **配色跟随主题**：桌面窗口底色、Android 启动底色、浏览器 theme-color 都换成新的
  深色 #141210 / 浅色 #f0ebe0。

### Fixed

- **手机输入法打的字发不出去**：部分输入法（如小米/HyperOS 的九宫格）提交文字时
  不发 `input` 事件，React 里保存的输入内容一直是空的，发送按钮就一直是灰的；
  只有在输入框里删除字符时（删除走常规事件）按钮才会亮。现在输入框同时挂原生
  编辑事件，并在聚焦时每 180ms 对一次框里的真实文字，打字、联想词、粘贴都会
  立刻点亮发送键；行内编辑消息的输入框也一并修了。
- 手机起始页的卡片删除按钮不再每张卡都挂一个明显的方框，只在悬停或点按时出现。
- 起始页「上一页 / 下一页」改回居中，不再贴着左边。

### Notes

- 单测 130 项、E2E 28 项全过（新增「文字不经过 input 事件时发送键也要亮」的
  回归用例）；桌面 1440×900 与手机 390×844 都逐个页面截图核对，深色、浅色两套
  都检查过。
- 已在 Windows 与某品牌手机实机上回归（含输入法打字、发送、起始页分页）。

## [1.7.1] - 2026-11-18

### Added

- **对话置顶与归档**：对话列表每一项现在有一个三点菜单，点开是「置顶 / 归档 /
  删除对话」。置顶的对话永远排在最前面；归档的对话从主列表隐藏，但不会被删除。
  列表底部的「查看归档」会展开归档内容，显示角色头像、对话标题和最近更新日期，
  每一项都可以「恢复」或彻底删除。
- **彻底删除**：从三点菜单或归档里删除对话都会先确认一次，确认后从本机彻底删除，
  无法恢复；角色卡本身不受影响。

### Fixed

- **APK 起始页右上角三个按钮点不动**：欢迎页顶栏原本绝对定位在可滚动的内容里，
  页面内容会伸到顶栏下面，滚动后还会把顶栏带离可点区域。现在顶栏是独立的一行、
  固定在上方，只有下面的欢迎内容滚动，三个按钮（对话列表 / 角色卡 / 设置）始终可点。
- **对话列表搜索框图标压住文字**：通用输入框样式把搜索框的左内边距重置成了
  10px，放大镜正好落在「搜索对话…」上。现在搜索框保留 36px 左内边距，
  图标与占位文字之间留出明确间隔。
- **Windows 单文件启动器可能启动旧版本**：启动器里原本写死了版本号，新一轮打包
  若忘了改，新安装包会解压并运行上一个版本目录。现在版本号在构建时从
  `package.json` 注入，不会再出现启动器与安装包版本不一致。

### Changed

- **起始页精简**：去掉标题下的小字说明和底部提示；角色卡缩小（头像 44px、
  去掉「开始聊天」一行），一页能更轻松地看到全部卡片；总张数「共 xx 张」
  移到「下一页」按钮右侧，并移除「点卡片右上角 ✕ 可删除」的提示。
- **删除入口更安全**：对话列表原来的垃圾桶按钮改为三点菜单，避免误触直接删除。

### Notes

- 单测 130 项、E2E 27 项全过（新增置顶 / 归档 / 恢复 / 彻底删除、起始页精简、
  顶栏可点性与搜索框间距等回归）。
- 已在 Windows exe 与某品牌手机实机上回归。

## [1.6.9] - 2026-11-18

### Added

- **起始页分页与「新建」入口**：角色卡多的时候，起始页不再一次铺满全部卡片，而是每页
  9 张（手机 6 张），底部有「上一页 / 下一页」和页码。底部操作区同时保留
  **「再导入一张」和「新建一张」**，两个按钮同样大小、同等优先级；一张卡都没有时，
  空状态里的「导入角色卡」和「手动新建」也改成等宽按钮。
- **角色卡栏分页并定位当前卡**：右侧角色卡列表每页 8 张。从某个对话打开角色卡栏时，
  会自动跳到这张对话所用角色卡所在的那一页，不再需要往下翻很久；切换对话、收起再展开
  也会保持定位。
- **手机滑动开关两侧抽屉**：在对话页从右往左滑打开角色卡栏，从左往右滑打开对话列表；
  在对话列表里从右往左滑关闭，在角色卡栏里从左往右滑关闭。滑动带方向与距离判断，
  纵向滚动不受影响。

### Fixed

- **APK 打开一会儿就发烫（高 CPU）**：真机测量发现罪魁祸首是全屏极光的
  `background-position` 循环动画——它每帧重绘整个视口，又被磨砂面板的
  `backdrop-filter` 放大，空闲时 WebView 与 SurfaceFlinger 持续占用 100% 以上 CPU。
  Android 端现在保留同样的极光外观但停止这组装饰动画（品牌图标与欢迎页光晕的循环也一并停止），
  真实交互（抽屉、弹窗、按钮）的过渡动画不变。真机空闲 CPU 从约 110% 降到 0–3%，
  发烫明显消失。

### Changed

- 起始页、角色卡栏的卡片列表改为分页；空状态与有卡状态都保证「导入」和「新建」同时存在。
- 手机上的分页控件、按钮和页码沿用现有暖色主题，深色 / 浅色模式都已适配。

### Notes

- 单测 125 项、E2E 25 项全过（新增分页、当前卡定位、滑动开关抽屉、空状态按钮等回归）。
- 已在 Windows exe 与某品牌手机实机上回归；真机测量：空闲 5 个采样点应用进程 CPU 均为 0%，
  SurfaceFlinger 为 0–3.5%。

## [1.6.8] - 2026-11-18

### Added

- **引号对白高亮**：无论 AI 还是你自己发的消息，被 `"…"`、`“…”`、`«…»`、`「…」`、`『…』`、
  `＂…＂` 包起来的文字都会用暖橙色标出来，长对白一眼就能和旁白区分开。规则参考 SillyTavern
  的 `.mes_text q`：代码块与行内代码里的引号不动，引号不跨行匹配，落单的引号会跳过。
- **本人头像**：设置 → 角色扮演 → 「你的称呼」下面新增头像上传框，可以上传、更换或移除。
  上传并保存后，聊天里自己发送的消息右侧会带上头像；没有上传时保持原样，不显示头像。
  头像会压缩到 320px 以内再存进本机，不会把手机原图整张塞进聊天库。

### Fixed

- **APK 编辑消息时输入法遮挡编辑框**：开始编辑消息后，键盘弹出会触发「滚到最新消息」，
  把编辑框顶出视野；底部输入框又占着键盘上方，看起来就像输入框盖住了编辑框。
  现在编辑期间不再自动滚到底部，而是把编辑框滚到视野中央；手机宽度下同时收起底部输入框，
  把键盘上方的空间全部让给编辑器，保存 / 取消按钮始终可点。

### Changed

- **APK 聊天页底部提示**：去掉多余的「Enter 发送 · Shift + Enter 换行」，只保留世界书挂载状态
  与「删除对话」；exe 端保持原有提示不变。
- 设置 → 角色扮演里，「本人头像」上传框与上方的「你的称呼 / 温度」一行留出明显的间距，
  不再紧挨着输入框。

### Notes

- 单测 121 项、E2E 23 项全过（新增引号高亮、本人头像、编辑时收起输入框的回归）。
- 已在 Windows 单文件 exe 与某品牌手机实机上回归：编辑历史消息、引号高亮、头像上传与显示。

## [1.6.7] - 2026-11-17

### Fixed

- **Android 上输入法盖住输入框**：1.6.2 起界面改为 edge-to-edge（窗口不再随键盘收缩），
  但键盘高度没有像状态栏那样下发给界面，于是聊天输入框被键盘压在下面。
  现在原生层把 IME inset 一并发布为 `--keyboard-inset`，界面用底部内边距让出这块空间：
  聊天输入框、弹窗里的输入框都会移到键盘上方，键盘弹出时聊天窗口自动滚到最新一条。
- 弹窗（设置、世界书编辑等）的背景层同样让出键盘高度，底部弹出的弹窗不会再被键盘切成两半。

### Notes

- 单测新增 4 项覆盖键盘 inset（高度、关闭归零、缺省、变更事件）。

## [1.6.6] - 2026-11-17

### Fixed

- **编辑世界书时词条列表塌陷**：词条是列表容器的 flex 子项，词条一多就被压成几像素高、
  彼此重叠，展开后的详情也被 `overflow: hidden` 裁掉，看起来像「只能看不能改」。
  现在每条固定自身高度、由列表内部滚动，点开某条会自动把它滚进视野；标题、关键词、
  次要关键词、内容、插入位置、常驻/禁用等字段都能正常编辑。

### Notes

- E2E 补到 21 项，新增一项回归：17 条词条时每条高度正常、互不重叠，且点开后能编辑内容并保存。

## [1.6.5] - 2026-11-17

### Added

- **角色卡当背景**：对话设置 → 背景图里新增「用角色卡图片作为背景」。勾上后这张卡的头像
  同时充当聊天区背景，换头像会自动跟着变；**JSON 导入的卡没有图片，勾选框会置灰并说明原因**，
  可以先去「编辑角色卡」补一张头像。上传的背景图会保留，取消勾选即恢复显示。
- **左右两栏可折叠（桌面端）**：对话列表在品牌栏、角色卡在标题栏各有一个收起按钮；收起后
  窗口边缘出现一条细把手，点一下就能展开。折叠状态会记住，下次打开还是上次的样子。

### Fixed

- **角色卡菜单层级错乱**：点卡片右上角 ⋯ 弹出的菜单会被下面的卡片盖住，菜单背景半透明导致
  文字交缠，点菜单项时反而点到下方的角色卡上。现在菜单渲染到 `body` 上、带全屏遮罩、
  背景不透明，菜单项真正可以点。
- **角色卡菜单不会自动收起**：点击空白处、按 Esc、滚动列表或改变窗口大小都会关闭。
- 角色卡菜单超出面板边界时不再被列表裁掉，空间不够会自动向上展开。

### Notes

- E2E 补到 20 项，新增：菜单层级与外部点击关闭、两栏折叠与记忆、角色卡背景（PNG 可用 /
  JSON 置灰）。
- 已在 Windows 单文件 exe 与某品牌手机实机上回归。

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
