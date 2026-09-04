import { identifyVideo, subtitleFilename } from './lib/video.js';
import { cuesToText, textDataUrl } from './lib/text.js';
import { youtubeRequest } from './platforms/youtube.js';
import { bilibiliRequest } from './platforms/bilibili.js';

const pending = new Set();
const sessionKey = tabId => `subtitle:${tabId}`;

async function currentVideo(tabId) {
  const tab = await chrome.tabs.get(tabId);
  const video = identifyVideo(tab.url);
  if (!video) throw new Error('請先開啟 YouTube 或 Bilibili 的影片頁面。');
  return video;
}

async function requestPage(tabId, video, action, extra = {}) {
  let results;
  try {
    results = await chrome.scripting.executeScript({
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
      await chrome.storage.session.remove(key);
      const data = await requestPage(tabId, video, 'discover');
      if (typeof data?.title !== 'string' || !Array.isArray(data.tracks)
          || data.tracks.some(track => !['id', 'label', 'language', 'kind'].every(field => typeof track[field] === 'string'))) {
        throw new Error('平台字幕資料格式無法辨識。');
      }
      const snapshot = { ...data, video, scannedAt: Date.now() };
      await chrome.storage.session.set({ [key]: snapshot });
      return snapshot;
    }
    if (type === 'download') {
      const stored = (await chrome.storage.session.get(key))[key];
      if (!stored || stored.video.key !== video.key || Date.now() - stored.scannedAt > 30 * 60_000) {
        throw new Error('字幕清單已過期或影片已切換，請重新搜尋。');
      }
      if (!stored.tracks.some(track => track.id === message.trackId)) throw new Error('請先選擇一份字幕。');
      const data = await requestPage(tabId, video, 'download', { trackId: message.trackId, cid: stored.cid });
      const text = cuesToText(data.cues);
      const filename = subtitleFilename(data.title, data.language);
      // Omitting saveAs deliberately respects Chrome's download preferences.
      const downloadId = await chrome.downloads.download({ url: textDataUrl(text), filename, conflictAction: 'uniquify' });
      return { downloadId, filename, lines: text.split('\r\n').length - 1 };
    }
    throw new Error('不支援的操作。');
  } finally { pending.delete(tabId); }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html')) return false;
  if (!['discover', 'download'].includes(message?.type)) return false;
  handle(message).then(data => sendResponse({ ok: true, data }), error => sendResponse({ ok: false, error: error.message || '字幕處理失敗，請再試一次。' }));
  return true;
});

chrome.tabs.onRemoved.addListener(tabId => { chrome.storage.session.remove(sessionKey(tabId)); });
