import { cp, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = new URL('../', import.meta.url);
export const firefoxOutput = fileURLToPath(new URL('dist/firefox/', root));

// Chrome source stays untouched. Explicit inputs prevent QA files or credentials
// from entering the Firefox package; only the two browser entry points differ.
export async function buildFirefox(output = firefoxOutput) {
  const chromeManifest = JSON.parse(await readFile(new URL('extension/manifest.json', root), 'utf8'));
  const manifest = JSON.parse(await readFile(new URL('firefox/manifest.json', root), 'utf8'));
  if (manifest.version !== chromeManifest.version) throw new Error('Chrome and Firefox manifest versions must match.');
  await mkdir(output, { recursive: true });
  for (const name of ['popup.html', 'popup.css', 'icons', 'lib', 'platforms']) {
    await cp(fileURLToPath(new URL(`extension/${name}`, root)), resolve(output, name), { recursive: true });
  }
  for (const name of ['manifest.json', 'background.js', 'popup.js']) {
    await cp(fileURLToPath(new URL(`firefox/${name}`, root)), resolve(output, name));
  }
  return { output, manifest };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { output } = await buildFirefox();
  console.log(output);
}
