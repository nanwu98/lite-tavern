import fs from 'node:fs';

// Usage: node scripts/bump-version.mjs [version] [androidVersionCode]
// Defaults to the version already in package.json and the next versionCode.
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = process.argv[2] ?? pkg.version;
const gradleBefore = fs.readFileSync('android/app/build.gradle', 'utf8');
const code = Number(
  process.argv[3] ?? Number(/versionCode (\d+)/.exec(gradleBefore)?.[1] ?? 0) + 1,
);

pkg.version = version;
pkg.license = 'MIT';
pkg.author = 'LiteTavern contributors';
pkg.description = 'A minimal local client for SillyTavern character cards and world books';
pkg.keywords = [
  'sillytavern',
  'character-card',
  'worldbook',
  'llm',
  'openai-compatible',
  'electron',
  'capacitor',
];
pkg.engines = { node: '>=20' };
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');

let gradle = gradleBefore;
gradle = gradle
  .replace(/versionCode \d+/, `versionCode ${code}`)
  .replace(/versionName "[^"]*"/, `versionName "${version}"`);
fs.writeFileSync('android/app/build.gradle', gradle, 'utf8');

let launcher = fs.readFileSync('scripts/Launcher.cs', 'utf8');
launcher = launcher
  .replace(/AppVersion = "[^"]*"/, `AppVersion = "${version}"`)
  .replace(/"\d+\.\d+\.\d+\.0"/g, `"${version}.0"`);
fs.writeFileSync('scripts/Launcher.cs', launcher, 'utf8');

console.log(
  'version',
  pkg.version,
  'android',
  /versionCode \d+/.exec(gradle)?.[0],
  /versionName "[^"]*"/.exec(gradle)?.[0],
);
console.log(
  'launcher',
  /AppVersion = "[^"]*"/.exec(launcher)?.[0],
  /AssemblyVersion\("[^"]*"\)/.exec(launcher)?.[0],
);
