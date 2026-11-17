import fs from 'node:fs';
import crypto from 'node:crypto';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const files = [
  `release/LiteTavern-${pkg.version}-win-x64.exe`,
  `release/LiteTavern-${pkg.version}.apk`,
];
const lines = [];
for (const file of files) {
  if (!fs.existsSync(file)) {
    console.log('missing', file);
    continue;
  }
  const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const size = fs.statSync(file).size;
  lines.push(`${hash}  ${file.split('/').pop()}  (${(size / 1024 / 1024).toFixed(2)} MB)`);
}
fs.writeFileSync('release/SHA256SUMS.txt', lines.join('\n') + '\n', 'utf8');
console.log(lines.join('\n'));
