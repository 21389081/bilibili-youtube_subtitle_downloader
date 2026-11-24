// Serialized into the active video page to use the user's existing Bilibili session.
export async function bilibiliRequest(request) {
  const fail = message => ({ ok: false, error: message });
  const ensureCurrent = () => {
    const url = new URL(location.href);
    const id = url.pathname.match(/^\/video\/(BV[0-9A-Za-z]{10}|av\d+)\/?$/i)?.[1];
    if (id?.toLowerCase() !== request.video.id.toLowerCase() || Number(url.searchParams.get('p') || 1) !== request.video.part) {
      throw new Error('影片或分 P 已切換，請重新搜尋字幕。');
    }
  };
  const getJson = async (url, credentials = 'include') => {
    const response = await fetch(url, { credentials, signal: AbortSignal.timeout(12000) });
    if ([403, 412, 429].includes(response.status)) throw new Error(`Bilibili 暫時限制請求（HTTP ${response.status}），請先確認影片可正常播放，再稍後重試。`);
    if (!response.ok) throw new Error(`Bilibili 請求失敗（HTTP ${response.status}），請稍後重試。`);
    const text = await response.text();
    if (text.length > 12_000_000) throw new Error('字幕資料過大，暫時無法處理。');
    try { return JSON.parse(text); } catch { throw new Error('Bilibili 回傳無法辨識的資料，請稍後重試。'); }
  };
  const api = async (path, params) => {
    const url = new URL(path, 'https://api.bilibili.com');
    url.search = new URLSearchParams(params).toString();
    const result = await getJson(url.href);
    if (result.code !== 0 || !result.data) {
      if (result.code === -101) throw new Error('請先登入 Bilibili，再重新搜尋字幕。');
      if ([-352, -412, -403].includes(result.code)) throw new Error('Bilibili 暫時限制請求，請稍後再試。');
      throw new Error(`Bilibili 無法提供影片資料（代碼 ${result.code ?? '未知'}）。`);
    }
    return result.data;
  };
  try {
    ensureCurrent();
    const query = /^av/i.test(request.video.id) ? { aid: request.video.id.slice(2) } : { bvid: request.video.id };
    const info = await api('/x/web-interface/view', query);
    ensureCurrent();
    const part = info.pages?.find(page => Number(page.page) === request.video.part);
    if (!part?.cid) return fail('找不到目前分 P 的影片資料，請重新整理頁面後重試。');
    if (request.cid && request.cid !== part.cid) return fail('目前分 P 已更新，請重新搜尋字幕。');
    const data = await api('/x/player/wbi/v2', { ...query, cid: String(part.cid) });
    ensureCurrent();
    if (data.need_login_subtitle) return fail('這支影片的字幕需要登入，請先登入 Bilibili 再重試。');
    if (!Array.isArray(data.subtitle?.subtitles)) return fail('Bilibili 字幕清單格式無法辨識，請稍後重試。');
    const rawTracks = data.subtitle.subtitles;
    if (rawTracks.some(track => !track.subtitle_url)) return fail('Bilibili 未提供字幕下載網址，請確認已登入並可在播放器開啟字幕。');
    const tracks = rawTracks.map((track, index) => ({
      id: String(track.id_str || track.id || `${track.lan}:${index}`),
      language: track.lan || 'und',
      label: track.lan_doc || track.lan || '未標示語言',
      kind: track.ai_type === 1 || /^ai-/.test(track.lan || '') ? 'auto'
        : track.ai_type === 0 ? 'manual' : 'unknown',
      url: track.subtitle_url,
    }));
    const title = info.pages.length > 1 ? `${info.title} - P${part.page} ${part.part || ''}`.trim() : info.title;
    if (request.action === 'discover') {
      return { ok: true, data: { title, cid: part.cid, tracks: tracks.map(({ url, ...track }) => track) } };
    }
    const selected = tracks.find(track => track.id === request.trackId);
    if (!selected) return fail('這份字幕已不可用，請重新搜尋字幕。');
    const url = new URL(selected.url, 'https://www.bilibili.com');
    const allowed = url.hostname === 'bilibili.com' || url.hostname.endsWith('.bilibili.com')
      || url.hostname === 'hdslb.com' || url.hostname.endsWith('.hdslb.com');
    if (url.protocol !== 'https:' || !allowed || url.username || url.password) return fail('平台回傳的字幕網址無法驗證，已停止下載。');
    const subtitles = await getJson(url.href, 'omit');
    ensureCurrent();
    if (!Array.isArray(subtitles.body) || subtitles.body.some(cue => typeof cue.content !== 'string')) {
      return fail('Bilibili 字幕內容格式無法辨識。');
    }
    return { ok: true, data: { title, language: selected.language, cues: subtitles.body.map(cue => cue.content) } };
  } catch (error) {
    if (['TimeoutError', 'AbortError'].includes(error?.name)) return fail('字幕請求逾時，請稍後重試。');
    return fail(error?.message === 'Failed to fetch' ? '無法連線至 Bilibili，請確認已登入、網路正常，再重試。' : error?.message || 'Bilibili 字幕取得失敗。');
  }
}
