import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Builds the `version.json` asset that ships next to every release.
 *
 * The app treats this file as the single source of truth for "is there a newer
 * version", so it carries the exact file name, byte size and SHA-256 of each
 * installer. Those hashes are what make mirrored downloads safe: a mirror that
 * rewrites the binary is detected and discarded.
 *
 * Usage:
 *   node scripts/make-version-manifest.mjs [--version 1.5.0] [--dir release]
 */

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--version') args.version = argv[++i];
    else if (arg === '--dir') args.dir = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = args.version ?? pkg.version;
const directory = path.resolve(args.dir ?? 'release');

const repositoryUrl =
  typeof pkg.repository === 'string' ? pkg.repository : (pkg.repository?.url ?? '');
const slug = /github\.com[/:]([^/]+)\/([^/.]+)/i.exec(repositoryUrl)?.slice(1).join('/') ?? '';
const releaseUrl = slug ? `https://github.com/${slug}/releases/tag/v${version}` : undefined;

function sha256(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** Pulls the Keep-a-Changelog section for `version` so release notes stay in sync. */
function releaseNotes(target) {
  try {
    const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
    const sections = changelog.split(/^## /m);
    const match = sections.find((section) => section.startsWith(`[${target}]`));
    if (!match) return '';
    return match.split('\n').slice(1).join('\n').trim();
  } catch {
    return '';
  }
}

const assets = {
  windows: `LiteTavern-${version}-win-x64.exe`,
  android: `LiteTavern-${version}.apk`,
};

const manifest = {
  version,
  publishedAt: new Date().toISOString(),
  ...(releaseUrl ? { releaseUrl } : {}),
  notes: releaseNotes(version),
};

const missing = [];
for (const [platform, file] of Object.entries(assets)) {
  const full = path.join(directory, file);
  if (!fs.existsSync(full)) {
    missing.push(file);
    continue;
  }
  const stat = fs.statSync(full);
  manifest[platform] = {
    file,
    size: stat.size,
    sha256: sha256(full),
  };
  console.log(`${platform.padEnd(8)} ${file} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
}

if (!manifest.windows && !manifest.android) {
  console.error(`没有找到任何安装包，检查目录：${directory}`);
  process.exit(1);
}
if (missing.length) console.warn(`跳过缺失的安装包：${missing.join(', ')}`);

const output = path.join(directory, 'version.json');
fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`写入 ${output}`);

// The release workflow feeds this file to `gh release --notes-file`.
const notesFile = path.join(directory, 'RELEASE_NOTES.md');
const notes = manifest.notes?.trim() || `LiteTavern ${version}`;
fs.writeFileSync(notesFile, `${notes}\n`, 'utf8');
console.log(`写入 ${notesFile}`);
