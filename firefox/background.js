import { identifyVideo, subtitleFilename } from './lib/video.js';
import { cuesToText } from './lib/text.js';
import { youtubeRequest } from './platforms/youtube.js';
import { bilibiliRequest } from './platforms/bilibili.js';

const pending = new Set();
const downloadUrls = new Map();

function releaseDownload(id) {
  const url = downloadUrls.get(id);
  if (!url) return;
  downloadUrls.delete(id);
  URL.revokeObjectURL(url);
}

async function downloadText(text, filename, incognito) {
  // Firefox validates download URLs differently from Chrome. Keep the text in a
  // Blob owned by this background document, including its UTF-8 BOM.
  const blob = new Blob(['\uFEFF', text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const id = await browser.downloads.download({ url, filename, conflictAction: 'uniquify', incognito });
    downloadUrls.set(id, url);
    // A tiny TXT can finish before download() resolves and before we know its ID.
    // The global event listener handles later transitions; search covers this race.
    try {
      const [item] = await browser.downloads.search({ id });
      if (['complete', 'interrupted'].includes(item?.state)) releaseDownload(id);
    } catch { /* A status lookup failure must not report a started download as failed. */ }
    return id;
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

browser.downloads.onChanged.addListener(delta => {
  if (['complete', 'interrupted'].includes(delta.state?.current)) releaseDownload(delta.id);
});
browser.downloads.onErased.addListener(releaseDownload);
const sessionKey = tabId => `subtitle:${tabId}`;

async function currentVideo(tabId) {
  const tab = await browser.tabs.get(tabId);
  const video = identifyVideo(tab.url);
  if (!video) throw new Error('請先開啟 YouTube 或 Bilibili 的影片頁面。');
  return video;
}

async function requestPage(tabId, video, action, extra = {}) {
  let results;
  try {
    results = await browser.scripting.executeScript({
      target: { tabId }, world: 'MAIN',
      func: video.platform === 'youtube' ? youtubeRequest : bilibiliRequest,
      args: [{ video, action, ...extra }],
    });
  } catch {
    throw new Error('無法讀取影片頁面，請重新開啟插件；若仍失敗，請重新整理影片後重試。');
  }
  const result = results?.[0]?.result;
  if (!result?.ok) throw new Error(result?.error || '未收到影片資料，請重新整理影片後重試。');
  if ((await currentVideo(tabId)).key !== video.key) throw new Error('影片已切換，請重新搜尋字幕。');
  return result.data;
}

async function handle(message) {
  const { tabId, type } = message;
  if (!Number.isInteger(tabId)) throw new Error('找不到目前影片分頁，請重新開啟插件。');
  if (pending.has(tabId)) throw new Error('字幕處理中，請稍候再試。');
  pending.add(tabId);
  try {
    const video = await currentVideo(tabId);
    const key = sessionKey(tabId);
    if (type === 'discover') {
      await browser.storage.session.remove(key);
      const data = await requestPage(tabId, video, 'discover');
      if (typeof data?.title !== 'string' || !Array.isArray(data.tracks)
          || data.tracks.some(track => !['id', 'label', 'language', 'kind'].every(field => typeof track[field] === 'string'))) {
        throw new Error('平台字幕資料格式無法辨識。');
      }
      const snapshot = { ...data, video, scannedAt: Date.now() };
      await browser.storage.session.set({ [key]: snapshot });
      return snapshot;
    }
    if (type === 'download') {
      const stored = (await browser.storage.session.get(key))[key];
      if (!stored || stored.video.key !== video.key || Date.now() - stored.scannedAt > 30 * 60_000) {
        throw new Error('字幕清單已過期或影片已切換，請重新搜尋。');
      }
      if (!stored.tracks.some(track => track.id === message.trackId)) throw new Error('請先選擇一份字幕。');
      const data = await requestPage(tabId, video, 'download', { trackId: message.trackId, cid: stored.cid });
      const text = cuesToText(data.cues);
      const filename = subtitleFilename(data.title, data.language);
      // Keep private downloads in the originating private browsing session.
      const { incognito } = await browser.tabs.get(tabId);
      // Omitting saveAs respects Firefox's download preferences.
      const downloadId = await downloadText(text, filename, incognito);
      return { downloadId, filename, lines: text.split('\r\n').length - 1 };
    }
    throw new Error('不支援的操作。');
  } finally { pending.delete(tabId); }
}

browser.runtime.onMessage.addListener((message, sender) => {
  if (sender.id !== browser.runtime.id || sender.url !== browser.runtime.getURL('popup.html')) return false;
  if (!['discover', 'download'].includes(message?.type)) return false;
  return handle(message).then(
    data => ({ ok: true, data }),
    error => ({ ok: false, error: error.message || '字幕處理失敗，請再試一次。' }),
  );
});

browser.tabs.onRemoved.addListener(tabId => { browser.storage.session.remove(sessionKey(tabId)); });
