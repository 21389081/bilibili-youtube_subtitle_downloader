import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const source = fileURLToPath(new URL('../extension/', import.meta.url));
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const zip = fileURLToPath(new URL('../dist/subtitle-text-downloader-0.1.0.zip', import.meta.url));
await mkdir(dist, { recursive: true });
if (process.platform !== 'win32') throw new Error('Run: cd extension && zip -r ../dist/subtitle-text-downloader-0.1.0.zip .');
const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', '$ErrorActionPreference = "Stop"; Get-ChildItem -LiteralPath $env:SUBTITLE_EXTENSION_SOURCE | Compress-Archive -DestinationPath $env:SUBTITLE_EXTENSION_ZIP -Force'], {
  env: { ...process.env, SUBTITLE_EXTENSION_SOURCE: source, SUBTITLE_EXTENSION_ZIP: zip }, stdio: 'inherit',
});
if (result.status !== 0) process.exit(result.status || 1);
console.log(zip);
