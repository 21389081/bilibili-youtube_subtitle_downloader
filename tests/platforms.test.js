import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { youtubeRequest } from '../extension/platforms/youtube.js';
import { bilibiliRequest } from '../extension/platforms/bilibili.js';

const videoId = 'aircAruvnKk';
const captionUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en`;
const ytResponse = (id = videoId) => ({
  videoDetails: { videoId: id, title: 'Current video' }, playabilityStatus: { status: 'OK' },
  captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ vssId: '.en', languageCode: 'en', name: { simpleText: 'English' }, baseUrl: captionUrl }] } },
});
function run(func, request, context = {}) {
  return vm.runInNewContext(`(${func.toString()})(request)`, {
    request, URL, URLSearchParams, AbortSignal, setTimeout: fn => { fn(); },
    performance: { getEntriesByType: () => [] },
    PerformanceObserver: class { observe() {} disconnect() {} },
    ...context,
  });
}
const ytRequest = action => ({ action, video: { id: videoId, platform: 'youtube' }, trackId: '.en' });
const ytContext = extra => ({ location: { href: `https://www.youtube.com/watch?v=${videoId}` },
  document: { getElementById: () => null, title: 'Current video' }, window: { ytInitialPlayerResponse: ytResponse() }, ...extra });
const httpJson = data => ({ ok: true, text: async () => JSON.stringify(data) });

test('YouTube prefers current player data over stale initial SPA globals', async () => {
  const result = await run(youtubeRequest, ytRequest('discover'), ytContext({
    document: { getElementById: () => ({ getPlayerResponse: () => ytResponse() }) },
    window: { ytInitialPlayerResponse: ytResponse('IHZwWFHWa-w') },
  }));
  assert.equal(result.ok, true); assert.equal(result.data.tracks[0].language, 'en');
});
test('YouTube keeps JSON3 cue boundaries and ignores window-only events', async () => {
  const result = await run(youtubeRequest, ytRequest('download'), ytContext({
    fetch: async () => httpJson({ events: [{ wpWinPosId: 1 }, { segs: [{ utf8: 'Hello ' }, { utf8: 'world' }] }, { segs: [{ utf8: 'again' }] }] }),
  }));
  assert.equal(result.ok, true); assert.deepEqual(Array.from(result.data.cues), ['Hello world', 'again']);
});
test('YouTube uses the player-provided verified URL and restores prior track', async () => {
  const previous = { languageCode: 'zh-TW', vss_id: '.zh-TW' }, changes = [], entries = [], requests = [];
  let disconnected = false;
  const player = { getPlayerResponse: () => ytResponse(), getOption: () => previous, loadModule() {},
    setOption: (module, option, track) => { changes.push(track); entries.push({ name: captionUrl + '&pot=test-fixture' }); } };
  const result = await run(youtubeRequest, ytRequest('download'), ytContext({
    document: { getElementById: () => player }, performance: { getEntriesByType: () => entries },
    PerformanceObserver: class { observe() {} disconnect() { disconnected = true; } },
    fetch: async url => { requests.push(url); return url.includes('pot=') ? httpJson({ events: [{ segs: [{ utf8: 'verified' }] }] }) : { ok: true, text: async () => '' }; },
  }));
  assert.equal(result.ok, true); assert.equal(result.data.cues[0], 'verified');
  assert.equal(requests.length, 2); assert.equal(changes.at(-1), previous); assert.ok(disconnected);
});
test('YouTube request failures cannot become an unbounded retry loop', async () => {
  let requests = 0;
  const player = { getPlayerResponse: () => ytResponse(), getOption: () => ({}), loadModule() {}, setOption() {} };
  const result = await run(youtubeRequest, ytRequest('download'), ytContext({
    document: { getElementById: () => player }, fetch: async () => { requests++; return { ok: false, status: 403 }; },
  }));
  assert.equal(result.ok, false); assert.match(result.error, /HTTP 403/); assert.equal(requests, 1);
});
test('YouTube rejects subtitle URLs for a different video', async () => {
  const response = ytResponse(); response.captions.playerCaptionsTracklistRenderer.captionTracks[0].baseUrl = captionUrl.replace(videoId, 'IHZwWFHWa-w');
  const result = await run(youtubeRequest, ytRequest('download'), ytContext({ window: { ytInitialPlayerResponse: response } }));
  assert.equal(result.ok, false); assert.match(result.error, /無法驗證/);
});

const biliRequest = action => ({ action, video: { id: 'BV13x41117TL', part: 2, platform: 'bilibili' }, trackId: 'sub1' });
const biliView = { code: 0, data: { title: 'Video', pages: [{ page: 1, cid: 100, part: 'One' }, { page: 2, cid: 200, part: 'Two' }] } };
const biliTrack = { id_str: 'sub1', lan: 'ai-zh', lan_doc: '中文', subtitle_url: '//aisubtitle.hdslb.com/sub.json' };
function biliContext(playerData, requests = [], body = { body: [{ from: 0, to: 1, content: '第二 P' }] }) {
  return { location: { href: 'https://www.bilibili.com/video/BV13x41117TL/?p=2' }, fetch: async url => {
    requests.push(url);
    return httpJson(url.includes('/view?') ? biliView : url.includes('/wbi/v2?') ? { code: 0, data: playerData } : body);
  } };
}
test('Bilibili maps current P to its CID and downloads only selected track', async () => {
  const requests = [];
  const result = await run(bilibiliRequest, biliRequest('download'), biliContext({ subtitle: { subtitles: [biliTrack] } }, requests));
  assert.equal(result.ok, true); assert.equal(result.data.cues[0], '第二 P');
  assert.ok(requests[1].includes('cid=200')); assert.equal(result.data.title, 'Video - P2 Two');
});
test('Bilibili login requirements are not reported as no subtitles', async () => {
  const result = await run(bilibiliRequest, biliRequest('discover'), biliContext({ need_login_subtitle: true, subtitle: { subtitles: [] } }));
  assert.equal(result.ok, false); assert.match(result.error, /登入/);
});
test('Bilibili an explicit empty subtitle array is a successful empty result', async () => {
  const result = await run(bilibiliRequest, biliRequest('discover'), biliContext({ subtitle: { subtitles: [] } }));
  assert.equal(result.ok, true); assert.equal(result.data.tracks.length, 0);
});
test('Bilibili rejects an unrelated subtitle host and a changed CID', async () => {
  const result = await run(bilibiliRequest, biliRequest('download'), biliContext({ subtitle: { subtitles: [{ ...biliTrack, subtitle_url: 'https://evil.example/sub.json' }] } }));
  assert.equal(result.ok, false); assert.match(result.error, /無法驗證/);
  const changed = await run(bilibiliRequest, { ...biliRequest('download'), cid: 100 }, biliContext({}));
  assert.equal(changed.ok, false); assert.match(changed.error, /更新/);
});
