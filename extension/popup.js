import { identifyVideo } from './lib/video.js';

const byId = id => document.getElementById(id);
const start = byId('start');
const form = byId('subtitle-form');
const tracks = byId('tracks');
const download = byId('download');
const status = byId('status');
let tabId, busy = false, downloadId = null;

function showStatus(text, kind = 'info') {
  status.textContent = text;
  status.dataset.kind = kind;
  status.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  status.classList.toggle('is-empty', !text);
}

function setBusy(value) {
  busy = value;
  start.disabled = value;
  download.disabled = value;
  for (const input of tracks.querySelectorAll('input')) input.disabled = value;
  form.setAttribute('aria-busy', String(value));
}

async function send(type, extra = {}) {
  const response = await chrome.runtime.sendMessage({ type, tabId, ...extra });
  if (!response?.ok) throw new Error(response?.error || '插件未回應，請重新開啟後重試。');
  return response.data;
}

function showTracks(items) {
  tracks.replaceChildren();
  items.forEach((track, index) => {
    const row = document.createElement('label');
    row.className = 'track';
    const input = document.createElement('input');
    input.type = 'radio'; input.name = 'track'; input.value = track.id;
    input.checked = index === 0;
    const name = document.createElement('span');
    name.className = 'track-name'; name.textContent = track.label;
    const kind = document.createElement('span');
    kind.className = 'track-kind';
    kind.textContent = { auto: '自動產生', manual: '人工字幕', unknown: '來源未標示' }[track.kind] || '來源未標示';
    row.title = `${track.label} · ${kind.textContent}`;
    row.append(input, name, kind);
    tracks.append(row);
  });
  form.hidden = !items.length;
}

start.addEventListener('click', async () => {
  if (busy) return;
  setBusy(true);
  downloadId = null;
  form.hidden = true;
  showStatus('正在搜尋可用字幕…');
  start.textContent = '搜尋中…';
  try {
    const data = await send('discover');
    byId('video-title').textContent = data.title;
    showTracks(data.tracks);
    showStatus(data.tracks.length ? '' : '此影片沒有可下載的字幕');
  } catch (error) {
    showStatus(error.message, 'error');
  } finally {
    start.textContent = '重新搜尋';
    start.className = form.hidden ? 'primary' : 'secondary';
    setBusy(false);
  }
});

function updateDownload(item) {
  if (item.id !== downloadId) return;
  const state = typeof item.state === 'string' ? item.state : item.state?.current;
  if (state === 'complete') showStatus('TXT 已儲存，請至 Chrome 下載紀錄查看。', 'success');
  else if (state === 'interrupted') showStatus('下載已取消或中斷，可再次點擊「下載 TXT」。', 'error');
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  const selected = tracks.querySelector('input:checked');
  if (!selected) return showStatus('請先選擇一份字幕。', 'error');
  setBusy(true);
  downloadId = null;
  download.textContent = '處理中…';
  showStatus('正在取得字幕並轉成 TXT…');
  try {
    const data = await send('download', { trackId: selected.value });
    downloadId = data.downloadId;
    showStatus(`已交給 Chrome 下載，共 ${data.lines} 段字幕。`, 'success');
    const [item] = await chrome.downloads.search({ id: downloadId });
    if (item) updateDownload(item);
  } catch (error) { showStatus(error.message, 'error'); }
  finally { download.textContent = '下載 TXT'; setBusy(false); }
});

async function initialize() {
  start.disabled = true;
  if (!globalThis.chrome?.runtime?.id) {
    showStatus('請在 Chrome 載入此擴充功能，再從影片頁面點擊插件。');
    return;
  }
  chrome.downloads.onChanged.addListener(updateDownload);
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !identifyVideo(tab.url)) {
      byId('video-title').textContent = '未偵測到支援的影片';
      showStatus('請先開啟 YouTube 或 Bilibili 的影片頁面。');
      return;
    }
    tabId = tab.id;
    // Reading a title is local; subtitle discovery starts only when the button is clicked.
    byId('video-title').textContent = tab.title || '目前影片';
    start.disabled = false;
  } catch { showStatus('無法取得目前分頁，請重新開啟插件。', 'error'); }
}
initialize();
