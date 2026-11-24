import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { sharedFirefoxFiles, syncFirefoxAssets } from './sync-firefox-assets.mjs';
import { validateExtensionFiles } from './validate-extension-files.mjs';

const root = new URL('../', import.meta.url);
export const firefoxOutput = fileURLToPath(new URL('dist/firefox/', root));

// firefox/ is itself loadable from a fresh checkout. Refresh shared assets from
// the unchanged Chrome source before producing the runtime-only package.
export async function buildFirefox(output = firefoxOutput) {
  const source = fileURLToPath(new URL('firefox/', root));
  // Fail on an incomplete checkout instead of letting a build hide missing assets.
  await validateExtensionFiles(source);
  await syncFirefoxAssets();
  const manifest = JSON.parse(await readFile(new URL('firefox/manifest.json', root), 'utf8'));
  // Firefox patch versions are independent of the published Chrome version.
  for (const name of ['manifest.json', 'background.js', 'popup.js', ...sharedFirefoxFiles]) {
    const destination = resolve(output, name);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(resolve(source, name), destination);
  }
  await validateExtensionFiles(output);
  return { output, manifest };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { output } = await buildFirefox();
  console.log(output);
}
