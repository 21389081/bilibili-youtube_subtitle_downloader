import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { identifyVideo, subtitleFilename } from '../extension/lib/video.js';
import { cuesToText, textDataUrl } from '../extension/lib/text.js';
import { buildFirefox } from '../scripts/build-firefox.mjs';

const background = (await readFile(new URL('../firefox/background.js', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '');
function setup(incognito = false) {
  const tab = { id: 7, url: 'https://www.youtube.com/watch?v=aircAruvnKk', incognito };
  const entries = {};
  const downloads = [];
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
    downloads: { download: async options => { downloads.push(options); return 42; } },
  };
  vm.runInNewContext(background, { browser, identifyVideo, subtitleFilename, cuesToText, textDataUrl, youtubeRequest() {}, bilibiliRequest() {}, Date, Set });
  const sender = { id: browser.runtime.id, url: browser.runtime.getURL('popup.html') };
  return { tab, entries, downloads, removed: () => removed(7), send: (message, origin = sender) => listener({ tabId: 7, ...message }, origin) };
}

for (const incognito of [false, true]) {
  test(`Firefox Promise-only API downloads preserve private state (${incognito})`, async () => {
    const app = setup(incognito);
    assert.equal((await app.send({ type: 'discover' })).ok, true);
    const result = await app.send({ type: 'download', trackId: '.en' });
    assert.equal(result.ok, true);
    assert.equal(result.data.downloadId, 42);
    assert.equal(result.data.lines, 3);
    const [download] = app.downloads;
    assert.equal(download.incognito, incognito);
    assert.equal(download.conflictAction, 'uniquify');
    assert.equal(Object.hasOwn(download, 'saveAs'), false);
    assert.equal(decodeURIComponent(download.url.split(',')[1]), '\uFEFF第一段\r\nsecond line\r\n第一段\r\n');
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

test('Firefox build shares exact platform code and leaves Chrome manifest intact', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'subtitle-firefox-test-'));
  try {
    const original = await readFile(new URL('../extension/manifest.json', import.meta.url));
    const { manifest } = await buildFirefox(directory);
    assert.deepEqual(manifest.background, { scripts: ['background.js'], type: 'module' });
    assert.equal(manifest.browser_specific_settings.gecko.strict_min_version, '140.0');
    assert.equal(Object.hasOwn(manifest, 'host_permissions'), false);
    assert.equal(Object.hasOwn(manifest, 'minimum_chrome_version'), false);
    for (const name of ['lib/text.js', 'lib/video.js', 'platforms/youtube.js', 'platforms/bilibili.js', 'popup.html', 'popup.css']) {
      assert.deepEqual(await readFile(join(directory, name)), await readFile(new URL(`../extension/${name}`, import.meta.url)));
    }
    assert.deepEqual(await readFile(new URL('../extension/manifest.json', import.meta.url)), original);
  } finally {
    const allowed = resolve(tmpdir());
    if (resolve(directory).startsWith(allowed + (process.platform === 'win32' ? '\\' : '/')) && directory.includes('subtitle-firefox-test-')) {
      await rm(directory, { recursive: true });
    }
  }
});
