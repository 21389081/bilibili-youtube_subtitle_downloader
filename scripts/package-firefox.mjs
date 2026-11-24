import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildFirefox } from './build-firefox.mjs';

const { output, manifest } = await buildFirefox();
const webExt = fileURLToPath(new URL('../node_modules/web-ext/bin/web-ext.js', import.meta.url));
const artifacts = fileURLToPath(new URL('../dist/', import.meta.url));
const filename = `subtitle-text-downloader-firefox-${manifest.version}.zip`;
// Run through Node directly: npm's Windows .cmd shim breaks in paths containing &.
const result = spawnSync(process.execPath, [webExt, 'build', '--source-dir', output,
  '--artifacts-dir', artifacts, '--filename', filename, '--overwrite-dest', '--no-config-discovery'],
{ stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
