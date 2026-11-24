const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../firefox');
const reportedError = 'YouTube 未回傳字幕內容。請先在影片播放器開啟所選語言字幕，再重新搜尋下載。';
const message = reportedError +
  '這是一段必須能夠完整閱讀的較長錯誤說明。'.repeat(24) + '\n' + 'request-detail-'.repeat(30);
const mock = `globalThis.fixtureError=${JSON.stringify(reportedError)};globalThis.browser={runtime:{id:'firefox-layout',sendMessage:async ({type})=>type==='discover'?{ok:true,data:{title:'測試影片',tracks:[{id:'.zh',label:'中文',language:'zh',kind:'manual'}]}}:{ok:false,error:globalThis.fixtureError}},tabs:{query:async()=>[{id:1,url:'https://www.youtube.com/watch?v=YklDbfPBL_o',title:'測試影片'}]},downloads:{onChanged:{addListener(){}},search:async()=>[]}};`;
const server = http.createServer((request,response) => {
  const pathname = new URL(request.url,'http://localhost').pathname;
  if(pathname==='/mock.js'){response.writeHead(200,{'content-type':'text/javascript'});return response.end(mock);}
  const file=path.resolve(root,`.${pathname==='/'?'/popup.html':pathname}`);
  if(!file.startsWith(root+path.sep)){response.statusCode=403;return response.end();}
  try {
    let data=fs.readFileSync(file);
    if(file.endsWith('popup.html'))data=data.toString().replace('<script type="module"','<script src="/mock.js"></script><script type="module"');
    response.writeHead(200,{'content-type':file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html'});
    response.end(data);
  }catch{response.statusCode=404;response.end();}
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:380,height:560}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator('#start:not([disabled])').waitFor();
    await page.locator('#start').click();
    await page.locator('#subtitle-form:not([hidden])').waitFor();
    const cases = [];
    for (const text of [reportedError, message]) {
    await page.evaluate(value => { globalThis.fixtureError = value; }, text);
    await page.locator('#download').click();
    await page.locator('#status[data-kind="error"]').waitFor();
    assert.equal(await page.locator('#status').textContent(),text);
    const metrics=await page.locator('#status').evaluate(element=>({
      height:element.clientHeight,scrollHeight:element.scrollHeight,width:element.clientWidth,scrollWidth:element.scrollWidth,
      whiteSpace:getComputedStyle(element).whiteSpace,lineHeight:parseFloat(getComputedStyle(element).lineHeight),
      mainOverflow:getComputedStyle(document.querySelector('main')).overflowY,
    }));
    assert.ok(['normal','pre-wrap'].includes(metrics.whiteSpace),'long error is forced onto one line');
    assert.ok(metrics.height>metrics.lineHeight*2,'error did not wrap');
    assert.ok(metrics.scrollWidth<=metrics.width+1,'error overflows horizontally');
    assert.ok(metrics.scrollHeight<=metrics.height+1,'error text is clipped vertically');
    assert.equal(metrics.mainOverflow,'auto','long messages must remain reachable by scrolling');
    if (text === reportedError) await page.screenshot({path:path.resolve(__dirname,'../.qa/firefox-wrapped-error.png')});
    cases.push({characters:text.length,metrics});
    await page.locator('#download').scrollIntoViewIfNeeded();
    await page.locator('footer').scrollIntoViewIfNeeded();
    }
    assert.deepEqual(errors,[]);
    const screenshot=path.resolve(__dirname,'../.qa/firefox-wrapped-error-stress.png');
    await page.screenshot({path:screenshot,fullPage:true});
    console.log(JSON.stringify({cases,screenshot,errors}));
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
