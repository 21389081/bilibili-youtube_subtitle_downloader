const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const extensionRoot = path.resolve(__dirname, '../extension');
const tracks = Array.from({ length: 30 }, (_, index) => ({
  id: String(index),
  label: index === 0 ? '這是一個很長、很長、用來測試字幕選項換行時是否會造成跑版的繁體中文名稱' : `字幕語言 ${index + 1}`,
  language: `x-${index}`,
  kind: index % 2 ? 'auto' : 'manual',
}));
const longTitle = '這是一個非常長的影片標題，用來驗證文字換行時擴充功能介面是否仍然維持固定，不會跑版或亂跳動';
const mock = `globalThis.chrome={runtime:{id:'layout-test',sendMessage:async()=>{await new Promise(resolve=>setTimeout(resolve,75));return {ok:true,data:{title:${JSON.stringify(longTitle)},tracks:${JSON.stringify(tracks)}}}}},tabs:{query:async()=>{await new Promise(resolve=>setTimeout(resolve,75));return [{id:1,url:'https://www.youtube.com/watch?v=aircAruvnKk',title:${JSON.stringify(longTitle)}}]}},downloads:{onChanged:{addListener:()=>{}}}};`;

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname === '/mock.js') {
    response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
    return response.end(mock);
  }
  const file = path.resolve(extensionRoot, `.${pathname === '/' ? '/popup.html' : pathname}`);
  if (!file.startsWith(`${extensionRoot}${path.sep}`)) { response.statusCode = 403; return response.end(); }
  try {
    let data = fs.readFileSync(file);
    if (file.endsWith('popup.html')) data = data.toString().replace('<script type="module"', '<script src="/mock.js"></script><script type="module"');
    response.writeHead(200, { 'content-type': file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/html' });
    response.end(data);
  } catch { response.statusCode = 404; response.end(); }
});

function metrics(page) {
  return page.evaluate(() => {
    const body = document.body.getBoundingClientRect();
    const start = document.querySelector('#start').getBoundingClientRect();
    const footer = document.querySelector('footer').getBoundingClientRect();
    return { width: body.width, height: body.height, startTop: start.top, footerTop: footer.top, scrollWidth: document.body.scrollWidth };
  });
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const browser = await chromium.launch({ channel: 'chromium', headless: true });
  try {
    const bootstrapPage = await browser.newPage({ viewport: { width: 32, height: 700 } });
    await bootstrapPage.goto(`http://127.0.0.1:${port}`);
    assert.equal((await metrics(bootstrapPage)).width, 380, 'initial narrow viewport collapsed the popup width');
    await bootstrapPage.close();
    const page = await browser.newPage({ viewport: { width: 800, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}`);
    const opening = await metrics(page);
    await page.locator('#start:not([disabled])').waitFor();
    const initialized = await metrics(page);
    await page.locator('#start').click();
    await page.waitForTimeout(20);
    const loading = await metrics(page);
    await page.locator('#start:not([disabled])').waitFor();
    const loaded = await metrics(page);
    assert.deepEqual(initialized, opening, 'initial tab lookup shifted layout');
    assert.deepEqual(loading, opening, 'loading state shifted layout');
    assert.deepEqual(loaded, opening, 'loaded subtitles shifted layout');
    assert.equal(await page.locator('.track').count(), 30);
    assert.equal(await page.locator('#tracks').evaluate(element => element.scrollHeight > element.clientHeight), true);
    const trackBounds = await page.evaluate(() => {
      const list = document.querySelector('#tracks').getBoundingClientRect();
      const track = document.querySelector('.track').getBoundingClientRect();
      return { listRight: list.right, trackRight: track.right };
    });
    assert.ok(trackBounds.trackRight <= trackBounds.listRight - 8, `subtitle row overlapped the scrollbar edge: ${JSON.stringify(trackBounds)}`);
    if (process.env.LAYOUT_SCREENSHOT) await page.screenshot({ path: process.env.LAYOUT_SCREENSHOT, clip: { x: 0, y: 0, width: 380, height: 560 } });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ bootstrapWidth: 380, opening, initialized, loading, loaded, tracks: 30, trackBounds }));
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
