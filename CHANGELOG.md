# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/).

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
