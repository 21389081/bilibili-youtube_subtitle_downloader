import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const sharedFirefoxFiles = [
  'popup.html', 'lib/text.js', 'lib/video.js',
  'platforms/bilibili.js',
  'icons/icon-16.png', 'icons/icon-32.png', 'icons/icon-48.png', 'icons/icon-128.png',
];
const root = new URL('../', import.meta.url);
export async function syncFirefoxAssets() {
  let changed = 0;
  for (const name of sharedFirefoxFiles) {
    const source = await readFile(new URL(`extension/${name}`, root));
    const destination = fileURLToPath(new URL(`firefox/${name}`, root));
    let current;
    try { current = await readFile(destination); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (current?.equals(source)) continue;
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, source);
    changed++;
  }
  return changed;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Updated ${await syncFirefoxAssets()} shared Firefox assets.`);
}
