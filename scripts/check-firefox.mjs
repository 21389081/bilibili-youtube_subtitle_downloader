import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { buildFirefox } from './build-firefox.mjs';
import { validateExtensionFiles } from './validate-extension-files.mjs';
import { fileURLToPath } from 'node:url';

// Validate the exact folder users may load, before a build can fill missing files.
await validateExtensionFiles(fileURLToPath(new URL('../firefox/', import.meta.url)));

const { output, manifest } = await buildFirefox();
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.background, { scripts: ['background.js'], type: 'module' });
assert.ok(manifest.browser_specific_settings.gecko.id);
assert.ok(manifest.browser_specific_settings.gecko.data_collection_permissions.required.length);
for (const file of [manifest.action.default_popup, ...manifest.background.scripts, ...Object.values(manifest.icons)]) await readFile(join(output, file));
async function check(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await check(path);
    else if (entry.name.endsWith('.js')) {
      const result = spawnSync(process.execPath, ['--check', path], { stdio: 'inherit' });
      if (result.status !== 0) process.exit(result.status || 1);
    }
  }
}
await check(output);
console.log('Firefox manifest and JavaScript checks passed.');
