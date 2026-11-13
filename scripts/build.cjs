const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const result = esbuild.buildSync({ absWorkingDir: path.resolve(__dirname, '..'), entryPoints: ['./webview/workbench.js'], outfile: 'dist/workbench.js', bundle: true, minify: true, target: 'chrome120', legalComments: 'linked', metafile: true });
const packages = new Set();
for (const input of Object.keys(result.metafile.inputs)) {
  const marker = input.lastIndexOf('node_modules/');
  if (marker < 0) continue;
  const parts = input.slice(marker + 13).split('/');
  const name = parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  packages.add(input.slice(0, marker + 13) + name);
}
const notices = [];
for (const directory of [...packages].sort()) {
  const info = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  const license = fs.readdirSync(directory).find(name => /^licen[sc]e(?:\.|$)/i.test(name));
  notices.push(`${info.name} ${info.version}\n${license ? fs.readFileSync(path.join(directory, license), 'utf8') : 'License: ' + info.license}`);
}
fs.writeFileSync('dist/THIRD_PARTY_LICENSES.txt', notices.join('\n\n--------------------\n\n'));
