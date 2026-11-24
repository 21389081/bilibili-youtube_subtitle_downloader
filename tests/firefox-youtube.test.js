import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { youtubeRequest } from '../firefox/platforms/youtube.js';

const videoId = 'YklDbfPBL_o';
const baseUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=zh`;
const verifiedUrl = `${baseUrl}&pot=player-fixture&fmt=json3`;
const payload = JSON.stringify({ events: [{ segs: [{ utf8: '第一段中文人工字幕' }] }, { segs: [{ utf8: '第二段' }] }] });

function setup(transport = 'xhr', responseUrl = verifiedUrl, options = {}) {
  const originalTrack = { languageCode: 'zh', vss_id: '.zh' };
  let track = originalTrack, reloads = 0;
  const requests = [], changes = [], listeners = new Set();
  class XHR {
    constructor() { this.events = new Map(); this.responseType = ''; }
    open(method, url) { this.url = url; }
    addEventListener(type, fn) { this.events.set(type, fn); listeners.add(fn); }
    removeEventListener(type, fn) { if (this.events.get(type) === fn) this.events.delete(type); listeners.delete(fn); }
    send() {
      this.status = 200; this.responseURL = this.url; this.responseText = options.body ?? payload;
      requests.push({ transport: 'xhr', url: this.url });
      queueMicrotask(() => this.events.get('load')?.call(this));
    }
  }
  let consumed = false, playerResponse = Promise.resolve('');
  const nativeFetch = async input => {
    const url = String(input);
    requests.push({ transport: 'fetch', url });
    const text = url === verifiedUrl && reloads && !consumed ? options.body ?? payload : '';
    if (text) consumed = true;
    return new Response(text, { status: 200 });
  };
  const response = {
    videoDetails: { videoId, title: 'Manual Chinese captions' }, playabilityStatus: { status: 'OK' },
    captions: { playerCaptionsTracklistRenderer: { captionTracks: [{
      vssId: '.zh', languageCode: 'zh', name: { simpleText: '中文' }, baseUrl,
    }] } },
  };
  const player = {
    getPlayerResponse: () => response, getOption: () => track, loadModule() {},
    setOption(module, option, value) {
      changes.push({ option, value });
      if (option === 'track') track = value; // Re-selecting an enabled track does not reload it.
      if (option === 'reload' && value === true) {
        if (options.throwReload) throw new Error('player reload failed');
        reloads++;
        if (transport === 'xhr') { const xhr = new XHR(); xhr.open('GET', responseUrl); xhr.send(); }
        else playerResponse = context.fetch(responseUrl).then(response => response.text());
      }
    },
  };
  const context = {
    URL, URLSearchParams, Response, Request, AbortSignal, WeakMap, Set, Map, Promise,
    location: { href: `https://www.youtube.com/watch?v=${videoId}&t=5s` },
    document: { getElementById: () => player, title: 'Video' },
    ytInitialPlayerResponse: response, XMLHttpRequest: XHR, fetch: nativeFetch,
    performance: { getEntriesByType: () => [{ name: baseUrl }] },
    PerformanceObserver: class { observe() {} disconnect() {} },
    setTimeout: fn => setImmediate(fn), clearTimeout: clearImmediate,
  };
  context.window = context;
  const originalOpen = XHR.prototype.open, originalSend = XHR.prototype.send;
  return { context, originalTrack, requests, changes, listeners, readPlayerResponse: () => playerResponse, run: () => vm.runInNewContext(
    `(${youtubeRequest.toString()})({ action: 'download', video: { id: '${videoId}', platform: 'youtube' }, trackId: '.zh' })`, context),
    assertRestored() {
      assert.equal(context.fetch, nativeFetch);
      assert.equal(XHR.prototype.open, originalOpen);
      assert.equal(XHR.prototype.send, originalSend);
      assert.equal(track, originalTrack);
      assert.equal(listeners.size, 0);
    },
  };
}

for (const transport of ['xhr', 'fetch']) {
  test(`Firefox downloads enabled Chinese manual captions from the player's ${transport} response`, async () => {
    const app = setup(transport);
    const result = await app.run();
    assert.equal(result.ok, true, result.error);
    assert.deepEqual(Array.from(result.data.cues), ['第一段中文人工字幕', '第二段']);
    assert.ok(app.changes.some(change => change.option === 'reload'));
    if (transport === 'fetch') assert.equal(await app.readPlayerResponse(), payload, 'capture consumed the player response');
    app.assertRestored();
  });
}

test('Firefox ignores a player subtitle response for a different video and restores hooks', async () => {
  const app = setup('xhr', verifiedUrl.replace(videoId, 'aircAruvnKk'));
  const result = await app.run();
  assert.equal(result.ok, false);
  app.assertRestored();
});

for (const url of [verifiedUrl.replace('lang=zh', 'lang=en'), `${verifiedUrl}&tlang=zh-TW`]) {
  test(`Firefox does not substitute another track or a translated caption: ${new URL(url).searchParams.toString()}`, async () => {
    const app = setup('xhr', url);
    const result = await app.run();
    assert.equal(result.ok, false);
    app.assertRestored();
  });
}

test('Firefox restores player hooks and subtitle selection when reload throws', async () => {
  const app = setup('xhr', verifiedUrl, { throwReload: true });
  const result = await app.run();
  assert.equal(result.ok, false);
  assert.match(result.error, /player reload failed/);
  app.assertRestored();
});

test('Firefox empty player response reports a failure without saying captions are disabled', async () => {
  const app = setup('xhr', verifiedUrl, { body: '' });
  const result = await app.run();
  assert.equal(result.ok, false);
  assert.match(result.error, /播放器未提供可讀取的字幕內容/);
  assert.doesNotMatch(result.error, /請先.*開啟/);
  app.assertRestored();
});
