# Contributing to LiteTavern

Thanks for taking the time to contribute! This document describes how to set up the
project, what the code expects, and what a good pull request looks like.

## Development setup

Requirements:

- Node.js **22.13 or newer** (`.nvmrc` pins 22; pnpm 11 needs it)
- pnpm **11** (npm also works, but the lockfile is pnpm)
- For the desktop build: Windows 10/11 (the single-file launcher is a small .NET app)
- For the Android build: JDK 17+, Android SDK with `platforms;android-34` and `build-tools;34.0.0`

```bash
pnpm install
pnpm dev            # Vite dev server on http://localhost:5173
```

Useful scripts:

| Command               | What it does                                     |
| --------------------- | ------------------------------------------------ |
| `pnpm dev`            | Start the web UI in development                  |
| `pnpm build`          | Type-check and build the web bundle into `dist/` |
| `pnpm test`           | Run the unit tests (Vitest)                      |
| `pnpm test:e2e`       | Build, then run the Playwright end-to-end tests  |
| `pnpm format`         | Format the repository with Prettier              |
| `pnpm electron:start` | Run the Electron shell against the built `dist/` |
| `pnpm windows:build`  | Build the Windows single-file executable         |
| `pnpm android:build`  | Build and sign the Android APK                   |

The end-to-end tests drive the system Edge by default. On machines without Edge
(or on CI), run `npx playwright install chromium` and set
`PLAYWRIGHT_CHANNEL=chromium`.

Prettier is the single source of truth for formatting (`.prettierrc.json`,
`printWidth: 100`, single quotes, LF). `pnpm format:check` runs in CI, so run
`pnpm format` before you push instead of fighting the diff later.

The desktop and Android builders are PowerShell scripts in `scripts/`. They
auto-detect the Android SDK and JDK, and generate a throwaway signing key on
first run.

## Project layout

```
src/                 React UI, state and card/world-book logic
  components/        UI components
  hooks/             Chat generation hooks
  lib/               Card parsing, prompts, world book matching, API client
  lib/tavern/        Tavern-Helper compatible script runtime (iframe bridge)
  vendor/            Pinned third-party browser bundles (jQuery, Vue, zod, ...)
electron/            Electron main process and preload bridge
android/             Capacitor Android project
scripts/             Build scripts, launcher source, fixture helpers
tests/               Vitest fixtures and Playwright end-to-end tests
docs/                Screenshots used by the README
```

## Coding guidelines

- TypeScript + React function components; keep hooks small and obvious.
- Run `pnpm build` before opening a PR — it type-checks the whole project.
- Prefer clear names over clever ones. Comments explain _why_, not _what_.
- Do not add network calls to telemetry or analytics. The app is local-first.
- Card formats follow SillyTavern's `chara_card_v2/v3` semantics; when adding
  behaviour, match SillyTavern's own rules where they exist.

## Security and privacy

- **Never commit API keys, signing keys or personal paths.** Use environment
  variables or the git-ignored `android/keystore.properties`.
- Screenshots and fixtures must not contain real account data, keys, or private
  character cards.
- Character-card scripts execute in iframes; treat any new bridge API as
  security-sensitive and keep it minimal.

If you discover a vulnerability, please follow [SECURITY.md](SECURITY.md) instead
of opening a public issue.

## Pull requests

1. One topic per PR, with a short description of the user-visible change.
2. Add or update tests when behaviour changes. UI changes should come with a
   Playwright test when practical.
3. Make sure `pnpm test` and `pnpm test:e2e` pass.
4. Update `CHANGELOG.md` for user-visible changes.
5. Keep the diff focused; avoid unrelated formatting churn.
