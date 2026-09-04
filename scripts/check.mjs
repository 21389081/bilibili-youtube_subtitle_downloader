import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('extension/manifest.json', root), 'utf8'));
if (manifest.manifest_version !== 3) throw new Error('Manifest V3 required');
for (const file of [manifest.action.default_popup, manifest.background.service_worker]) await readFile(new URL(`extension/${file}`, root));
async function check(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await check(path);
    else if (/\.[cm]?js$/.test(entry.name)) {
      const result = spawnSync(process.execPath, ['--check', path], { stdio: 'inherit' });
      if (result.status !== 0) process.exit(result.status || 1);
    }
  }
}
await check(fileURLToPath(new URL('extension/', root)));
console.log('Manifest and extension JavaScript checks passed.');
