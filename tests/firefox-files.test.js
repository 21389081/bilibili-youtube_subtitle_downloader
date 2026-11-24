import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { validateExtensionFiles } from '../scripts/validate-extension-files.mjs';

test('Loading firefox/manifest.json resolves the popup, stylesheet, modules and icons', async () => {
  const directory = fileURLToPath(new URL('../firefox/', import.meta.url));
  const { manifest, files } = await validateExtensionFiles(directory);
  assert.equal(manifest.action.default_popup, 'popup.html');
  assert.equal(files, 12);
});
