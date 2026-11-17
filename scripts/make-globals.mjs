import fs from 'node:fs';

// 1) js-yaml UMD (classic script, sets window.jsyaml)
const yamlUrl = 'https://testingcf.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.min.js';
const yamlRes = await fetch(yamlUrl);
if (!yamlRes.ok) throw new Error(`yaml fetch failed: ${yamlRes.status}`);
const yaml = await yamlRes.text();
fs.writeFileSync('src/vendor/js-yaml.min.js', yaml, 'utf8');
console.log('yaml', yaml.length, 'has module check:', yaml.includes('module.exports'));

// 2) zod ESM -> classic global script exposing window.z
const src = fs.readFileSync('src/vendor/zod.esm.js', 'utf8');
if ((src.match(/\bexport\b/g) || []).length !== 1) {
  console.warn('unexpected number of export statements:', (src.match(/\bexport\b/g) || []).length);
}
const m = /export\s*\{([\s\S]*?)\}\s*;?\s*(?:\/\/[^\n]*)?\s*$/.exec(src);
if (!m) throw new Error('could not locate zod export clause');
const pairs = m[1]
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean)
  .map((p) => {
    const parts = p.split(/\s+as\s+/);
    return { local: parts[0].trim(), exported: (parts[1] || parts[0]).trim() };
  });
const zPair = pairs.find((p) => p.exported === 'z');
if (!zPair) throw new Error('zod export `z` not found');
const body = src.slice(0, m.index);
const namespace = pairs.map((p) => `${JSON.stringify(p.exported)}: ${p.local}`).join(', ');
const out = `/* zod v4 (generated from zod/v4/+esm) */\n(function(){\n${body}\nwindow.__LT_ZOD_NS__ = { ${namespace} };\nwindow.z = window.__LT_ZOD_NS__;\n})();\n`;
fs.writeFileSync('src/vendor/zod.global.js', out, 'utf8');
console.log('zod global written', out.length, 'z local =', zPair.local);

// 3) sanity: check the output parses as JS
new Function(out);
console.log('zod global parses ok');
