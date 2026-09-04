import test from 'node:test';
import assert from 'node:assert/strict';
import { cuesToText, textDataUrl } from '../extension/lib/text.js';
import { identifyVideo, subtitleFilename } from '../extension/lib/video.js';
test('each cue becomes one line; repeated cues and spoken timestamps are preserved', () => {
  assert.equal(cuesToText(['你好\n世界', '重複', '重複', '現在是 12:30', '   ']), '你好 世界\r\n重複\r\n重複\r\n現在是 12:30\r\n');
});
test('preserves literal markup, entities and emoji in plain subtitle text', () => {
  assert.equal(cuesToText(['a < b &amp; c 😀', '第一\r\n第二\u2028第三']), 'a < b &amp; c 😀\r\n第一 第二 第三\r\n');
});
test('empty or malformed subtitles fail instead of downloading empty files', () => {
  assert.throws(() => cuesToText(['\n ', '']), /空的/);
  assert.throws(() => cuesToText([{}]), /格式/);
});
test('UTF-8 download retains BOM and Unicode', () => {
  const text = '繁體中文 😀\r\n';
  assert.equal(decodeURIComponent(textDataUrl(text).split(',')[1]), '\uFEFF' + text);
});
test('filename rejects Windows reserved names, traversal, controls and separators', () => {
  assert.equal(subtitleFilename('CON', 'zh-Hant'), '_CON.zh-Hant.txt');
  const name = subtitleFilename('../你好/..\\測試:*?<>|\x00', '../en');
  assert.ok(!/[\\/:*?<>|\x00]/.test(name));
  assert.ok(!name.includes('..'));
  assert.ok(!name.startsWith('.'));
  assert.ok(name.endsWith('.txt'));
});
test('filename limits UTF-8 length without splitting characters', () => {
  const name = subtitleFilename('測試😀'.repeat(100), 'zh-Hant');
  assert.ok(new TextEncoder().encode(name).length < 200);
  assert.ok(!name.includes('\uFFFD'));
});
test('YouTube video identity ignores playback and playlist parameters', () => {
  assert.deepEqual(identifyVideo('https://www.youtube.com/watch?v=aircAruvnKk&t=4&list=abc'), { platform: 'youtube', id: 'aircAruvnKk', key: 'youtube:aircAruvnKk' });
  assert.equal(identifyVideo('https://www.youtube.com/shorts/aircAruvnKk').id, 'aircAruvnKk');
});
test('Bilibili identity differentiates current part', () => {
  const first = identifyVideo('https://www.bilibili.com/video/BV13x41117TL/');
  const second = identifyVideo('https://www.bilibili.com/video/BV13x41117TL/?p=2');
  assert.notEqual(first.key, second.key);
  assert.equal(second.part, 2);
  assert.equal(identifyVideo('https://www.bilibili.com/video/av123/?p=0'), null);
});
test('unrelated and deceptive hosts or non-video URLs are rejected', () => {
  for (const url of ['https://www.youtube.com.evil.test/watch?v=aircAruvnKk', 'javascript:alert(1)', 'https://www.youtube.com/', 'chrome://extensions', 'https://www.bilibili.com/video/BV13x41117TL/?p=2.5']) assert.equal(identifyVideo(url), null);
});
