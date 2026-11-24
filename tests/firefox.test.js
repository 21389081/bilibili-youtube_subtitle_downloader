import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { identifyVideo, subtitleFilename } from '../extension/lib/video.js';
import { cuesToText } from '../extension/lib/text.js';
import { buildFirefox } from '../scripts/build-firefox.mjs';

const background = (await readFile(new URL('../firefox/background.js', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '');
function setup(incognito = false, behavior = {}) {
  const tab = { id: 7, url: 'https://www.youtube.com/watch?v=aircAruvnKk', incognito };
  const entries = {};
  const downloads = [], revoked = [];
  const blobs = new Map(), states = new Map(), changed = new Set(), erased = new Set();
  const objectURLs = {
    createObjectURL(blob) { const url = `blob:moz-extension://test/${blobs.size + 1}`; blobs.set(url, blob); return url; },
    revokeObjectURL(url) { revoked.push(url); },
  };
  let listener, removed;
  const browser = {
    runtime: { id: 'firefox-test', getURL: path => `moz-extension://test/${path}`, onMessage: { addListener: fn => { listener = fn; } } },
    tabs: { get: async () => ({ ...tab }), onRemoved: { addListener: fn => { removed = fn; } } },
    storage: { session: {
      get: async key => ({ [key]: entries[key] }),
      set: async values => { Object.assign(entries, values); },
      remove: async key => { delete entries[key]; },
    } },
    scripting: { executeScript: async ({ args: [request], world }) => {
      assert.equal(world, 'MAIN');
      return [{ result: { ok: true, data: request.action === 'discover'
        ? { title: '字幕測試', tracks: [{ id: '.en', label: 'English', language: 'en', kind: 'manual' }] }
        : { title: '字幕測試', language: 'en', cues: ['第一段', 'second\nline', '第一段'] } } }];
    } },
    downloads: {
      onChanged: { addListener: fn => changed.add(fn) },
      onErased: { addListener: fn => erased.add(fn) },
      search: async ({ id }) => states.has(id) ? [{ id, state: states.get(id) }] : [],
      download: async options => {
        if (options.url.startsWith('data:')) throw new TypeError('Type error for parameter options (Error processing url: Error: Access denied for URL data:...)');
        assert.ok(options.url.startsWith('blob:'), 'Firefox must download a Blob URL');
        assert.ok(blobs.has(options.url), 'download references an unknown Blob URL');
        if (behavior.reject) throw new Error('download could not start');
        const id = 42 + downloads.length;
        downloads.push(options);
        states.set(id, behavior.finishedEarly ? 'complete' : 'in_progress');
        if (behavior.finishedEarly) for (const fn of changed) fn({ id, state: { current: 'complete' } });
        return id;
      },
    },
  };
  vm.runInNewContext(background, { browser, identifyVideo, subtitleFilename, cuesToText, youtubeRequest() {}, bilibiliRequest() {}, Date, Set, Map, Blob, URL: objectURLs });
  const sender = { id: browser.runtime.id, url: browser.runtime.getURL('popup.html') };
  return { tab, entries, downloads, blobs, revoked, change: delta => { for (const fn of changed) fn(delta); }, erase: id => { for (const fn of erased) fn(id); }, removed: () => removed(7), send: (message, origin = sender) => listener({ tabId: 7, ...message }, origin) };
}

for (const incognito of [false, true]) {
  test(`Firefox Promise-only API downloads preserve private state (${incognito})`, async () => {
    const app = setup(incognito);
    assert.equal((await app.send({ type: 'discover' })).ok, true);
    const result = await app.send({ type: 'download', trackId: '.en' });
    assert.equal(result.ok, true, result.error);
    assert.equal(result.data.downloadId, 42);
    assert.equal(result.data.lines, 3);
    const [download] = app.downloads;
    assert.equal(download.incognito, incognito);
    assert.equal(download.conflictAction, 'uniquify');
    assert.equal(Object.hasOwn(download, 'saveAs'), false);
    const blob = app.blobs.get(download.url);
    assert.equal(blob.type, 'text/plain;charset=utf-8');
    const bytes = Buffer.from(await blob.arrayBuffer());
    assert.deepEqual(Array.from(bytes.subarray(0, 3)), [0xef, 0xbb, 0xbf]);
    assert.equal(bytes.toString('utf8'), '\uFEFF第一段\r\nsecond line\r\n第一段\r\n');
    assert.deepEqual(app.revoked, [], 'Blob URL was revoked before the download completed');
    app.change({ id: result.data.downloadId, state: { current: 'complete' } });
    assert.deepEqual(app.revoked, [download.url]);
  });
}

test('Firefox background rejects page messages and unselected tracks', async () => {
  const app = setup();
  assert.equal(app.send({ type: 'discover' }, { id: 'firefox-test', url: 'https://www.youtube.com/' }), false);
  await app.send({ type: 'discover' });
  const result = await app.send({ type: 'download', trackId: 'arbitrary' });
  assert.equal(result.ok, false);
  assert.equal(app.downloads.length, 0);
});

test('Firefox refuses a subtitle list after changing videos or closing the tab', async () => {
  const app = setup(true);
  await app.send({ type: 'discover' });
  app.tab.url = 'https://www.youtube.com/watch?v=IHZwWFHWa-w';
  assert.equal((await app.send({ type: 'download', trackId: '.en' })).ok, false);
  app.removed();
  assert.equal(Object.keys(app.entries).length, 0);
  assert.equal(app.downloads.length, 0);
});

test('Firefox build preserves shared assets and Firefox overrides without changing Chrome', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'subtitle-firefox-test-'));
  try {
    const original = await readFile(new URL('../extension/manifest.json', import.meta.url));
    const { manifest } = await buildFirefox(directory);
    assert.deepEqual(manifest.background, { scripts: ['background.js'], type: 'module' });
    assert.equal(manifest.browser_specific_settings.gecko.strict_min_version, '140.0');
    assert.equal(Object.hasOwn(manifest, 'host_permissions'), false);
    assert.equal(Object.hasOwn(manifest, 'minimum_chrome_version'), false);
    for (const name of ['lib/text.js', 'lib/video.js', 'platforms/bilibili.js', 'popup.html']) {
      assert.deepEqual(await readFile(join(directory, name)), await readFile(new URL(`../extension/${name}`, import.meta.url)));
    }
    for (const name of ['popup.css', 'platforms/youtube.js']) {
      assert.deepEqual(await readFile(join(directory, name)), await readFile(new URL(`../firefox/${name}`, import.meta.url)));
    }
    assert.deepEqual(await readFile(new URL('../extension/manifest.json', import.meta.url)), original);
  } finally {
    const allowed = resolve(tmpdir());
    if (resolve(directory).startsWith(allowed + (process.platform === 'win32' ? '\\' : '/')) && directory.includes('subtitle-firefox-test-')) {
      await rm(directory, { recursive: true });
    }
  }
});


test('Firefox releases Blob URL when a download is rejected', async () => {
  const app = setup(false, { reject: true });
  await app.send({ type: 'discover' });
  const result = await app.send({ type: 'download', trackId: '.en' });
  assert.equal(result.ok, false);
  assert.match(result.error, /download could not start/);
  assert.equal(app.blobs.size, 1);
  assert.deepEqual(app.revoked, Array.from(app.blobs.keys()));
});

test('Firefox handles completion before downloads.download resolves', async () => {
  const app = setup(true, { finishedEarly: true });
  await app.send({ type: 'discover' });
  const result = await app.send({ type: 'download', trackId: '.en' });
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(app.revoked, [app.downloads[0].url]);
});

for (const outcome of ['interrupted', 'erased']) {
  test(`Firefox releases only its own Blob URL after download ${outcome}`, async () => {
    const app = setup();
    await app.send({ type: 'discover' });
    const result = await app.send({ type: 'download', trackId: '.en' });
    assert.equal(result.ok, true, result.error);
    app.change({ id: 999, state: { current: 'complete' } });
    assert.deepEqual(app.revoked, []);
    if (outcome === 'erased') app.erase(result.data.downloadId);
    else app.change({ id: result.data.downloadId, state: { current: 'interrupted' } });
    assert.deepEqual(app.revoked, [app.downloads[0].url]);
  });
}
