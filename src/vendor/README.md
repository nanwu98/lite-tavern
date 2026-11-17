# Vendored browser bundles

These files are shipped **verbatim** so that character-card scripts can run
offline inside the sandboxed iframe (`src/components/ScriptHost.tsx`). They are
not processed by Vite, Prettier or the TypeScript build, and each file keeps the
upstream license header it was downloaded with.

| File | Version | Upstream | License |
| --- | --- | --- | --- |
| `jquery.min.js` | 3.7.1 | <https://jquery.com> | MIT |
| `lodash.min.js` | 4.17.21 | <https://lodash.com> | MIT |
| `js-yaml.min.js` | 4.1.0 | <https://github.com/nodeca/js-yaml> | MIT |
| `vue.global.prod.js` | 3.5.45 | <https://vuejs.org> | MIT |
| `vue-router.global.prod.js` | 4.5.1 | <https://router.vuejs.org> | MIT |
| `zod.global.js` / `zod.esm.js` | 4.6.7 | <https://zod.dev> | MIT |

## Why they are committed

Card scripts expect `window.$`, `window._`, `window.jsyaml`, `window.Vue` and
`window.z` to exist and are written against a specific major version. Fetching
them from a CDN would break offline use and let a third party change the code
that runs next to the user's chats.

## Updating

1. Download the pinned build from the upstream release (keep the minified form).
2. Replace the file and update the table above.
3. Run `pnpm test:e2e` — `tests/e2e.spec.ts` exercises the script bridge, which
   loads these bundles.

Do not "improve" or reformat these files: the diff should stay empty except for
the version bump, so the shipped code can be compared byte-for-byte with
upstream.
