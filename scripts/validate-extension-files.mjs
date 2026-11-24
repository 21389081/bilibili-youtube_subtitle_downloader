import { readFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';

// Follow the actual manifest -> HTML -> module graph, including shared imports.
// A valid manifest alone does not mean that its popup can be loaded.
export async function validateExtensionFiles(directory) {
  const root = resolve(directory);
  const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
  const visited = new Set();
  async function visit(name, parent = resolve(root, 'manifest.json')) {
    const path = resolve(dirname(parent), name);
    const inside = relative(root, path);
    if (inside.startsWith('..') || isAbsolute(inside)) throw new Error(`Reference outside extension: ${name}`);
    if (visited.has(path)) return;
    visited.add(path);
    let data;
    try { data = await readFile(path); }
    catch (error) { throw new Error(`Missing extension file: ${inside} (referenced by ${relative(root, parent)})`, { cause: error }); }
    const extension = extname(path);
    const text = data.toString('utf8');
    if (extension === '.html') {
      for (const match of text.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
        if (!/^(?:[a-z]+:|#|\/\/)/i.test(match[1])) await visit(match[1], path);
      }
    } else if (extension === '.js' || extension === '.mjs') {
      for (const match of text.matchAll(/\b(?:import|export)\s+[^;]*?\bfrom\s*["'](\.[^"']+)["']/g)) await visit(match[1], path);
    }
  }
  const references = [manifest.action.default_popup, ...manifest.background.scripts,
    ...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon)];
  for (const name of references) await visit(name);
  return { manifest, files: visited.size };
}
