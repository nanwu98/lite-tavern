import fs from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
  repository?: string | { url?: string };
};

/**
 * `owner/repo`, used by in-app update checks. Read from package.json so the
 * release workflow and the running app always agree on where releases live.
 */
const repositoryUrl =
  typeof pkg.repository === 'string' ? pkg.repository : (pkg.repository?.url ?? '');
const repositorySlug =
  /github\.com[/:]([^/]+)\/([^/.]+)/i.exec(repositoryUrl)?.slice(1).join('/') ?? '';

export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __REPO_SLUG__: JSON.stringify(repositorySlug),
  },
  build: {
    outDir: 'dist',
    target: 'es2019',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
