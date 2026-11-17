# Security Policy

## Supported versions

Only the latest release receives security fixes.

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Instead, use the
repository's private vulnerability reporting ("Security" tab → "Report a
vulnerability") or contact the maintainers privately. Include:

- a description of the issue and its impact,
- reproduction steps,
- the affected version/platform.

You can expect an acknowledgement within a few days.

## Security model

LiteTavern is a local-first desktop/mobile client:

- **API keys** are stored only in the app's local storage (IndexedDB) and are
  sent only to the Base URL you configure. The app contains no analytics,
  telemetry or remote logging.
- **Character cards and world books** are stored locally. Nothing is uploaded
  anywhere except the prompt text sent to your configured model endpoint.
- **Character-card code** (Tavern Helper / JS-Slash-Runner scripts and HTML
  pages) is executed inside sandboxed iframes with a compatibility bridge. It is
  arbitrary code from the card author: only import cards you trust. The setting
  _Settings → 角色卡代码_ disables execution entirely.
- **Update and build integrity**: the repository contains no signing keys. Local
  APK signing configuration belongs in the git-ignored
  `android/keystore.properties` or environment variables.
