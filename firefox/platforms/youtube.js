// Serialized by chrome.scripting into the MAIN world. Keep this function self-contained.
export async function youtubeRequest(request) {
  let resourceObserver;
  const fail = message => ({ ok: false, error: message });
  const currentId = () => {
    const url = new URL(location.href);
    return url.pathname === '/watch' ? url.searchParams.get('v')
      : url.pathname.match(/^\/(?:shorts|live)\/([\w-]{11})\/?$/)?.[1];
  };
  const ensureCurrent = () => {
    if (currentId() !== request.video.id) throw new Error('影片已切換，請重新搜尋字幕。');
  };
  const label = value => value?.simpleText || value?.runs?.map(run => run.text || '').join('') || '';
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  try {
    ensureCurrent();
    let player, response;
    // YouTube keeps stale globals across SPA navigation and while advertisements play.
    for (let attempt = 0; attempt < 12; attempt++) {
      ensureCurrent();
      player = document.getElementById('movie_player');
      const candidates = [player?.getPlayerResponse?.(), window.ytInitialPlayerResponse];
      response = candidates.find(item => item?.videoDetails?.videoId === request.video.id);
      if (response) break;
      await pause(250);
    }
    if (!response) return fail('尚未取得目前影片資料，請等影片載入完成或廣告結束後重試。');
    if (response.playabilityStatus?.status && response.playabilityStatus.status !== 'OK') {
      return fail('目前無法存取這支影片，請先確認影片可正常播放。');
    }
    const raw = response.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (raw !== undefined && !Array.isArray(raw)) return fail('YouTube 字幕清單格式已改變，無法讀取。');
    const tracks = (raw || []).map((track, index) => ({
      id: track.vssId || `${track.languageCode}:${track.kind || 'manual'}:${index}`,
      language: track.languageCode || 'und',
      label: label(track.name) || track.languageCode || '未標示語言',
      kind: track.kind === 'asr' ? 'auto' : 'manual',
      baseUrl: track.baseUrl,
      vssId: track.vssId,
      rawKind: track.kind,
    }));
    if (tracks.some(track => typeof track.baseUrl !== 'string')) return fail('YouTube 字幕資料不完整，請重新整理影片後重試。');
    const title = response.videoDetails.title || document.title.replace(/ - YouTube$/, '');
    if (request.action === 'discover') {
      return { ok: true, data: { title, tracks: tracks.map(({ baseUrl, vssId, rawKind, ...track }) => track) } };
    }
    const selected = tracks.find(track => track.id === request.trackId);
    if (!selected) return fail('這份字幕已不可用，請重新搜尋字幕。');

    const safeUrl = value => {
      const url = new URL(value);
      if (url.protocol !== 'https:' || !['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(url.hostname)
          || url.pathname !== '/api/timedtext' || url.searchParams.get('v') !== request.video.id) {
        throw new Error('平台回傳的字幕網址無法驗證，已停止下載。');
      }
      return url;
    };
    const base = safeUrl(selected.baseUrl);
    // YouTube can fill the browser's 250-entry resource buffer before subtitles load.
    // Observe new entries without changing the page's global performance buffer.
    const recentResources = [];
    resourceObserver = new PerformanceObserver(list => {
      recentResources.push(...list.getEntries().filter(entry => entry.name.includes('/api/timedtext')));
      if (recentResources.length > 40) recentResources.splice(0, recentResources.length - 40);
    });
    resourceObserver.observe({ type: 'resource', buffered: true });
    const observedUrl = () => {
      const entries = [...performance.getEntriesByType('resource'), ...recentResources];
      for (let index = entries.length - 1; index >= 0; index--) {
        try {
          const url = safeUrl(entries[index].name);
          if (url.searchParams.get('lang') === base.searchParams.get('lang')
              && (url.searchParams.get('kind') || '') === (base.searchParams.get('kind') || '')
              && (url.searchParams.get('name') || '') === (base.searchParams.get('name') || '')
              && !url.searchParams.has('tlang')) return url;
        } catch { /* Ignore unrelated resources; never return their URLs. */ }
      }
      return null;
    };
    const parse = text => {
      if (!text.trim()) return null;
      if (text.trimStart().startsWith('{')) {
        const json = JSON.parse(text);
        if (!Array.isArray(json.events)) throw new Error('YouTube 字幕格式無法辨識。');
        return json.events.filter(event => Array.isArray(event.segs))
          .map(event => event.segs.map(segment => segment.utf8 || '').join(''));
      }
      const doc = new DOMParser().parseFromString(text, 'text/xml');
      if (doc.querySelector('parsererror') || !['transcript', 'timedtext'].includes(doc.documentElement.localName)) {
        throw new Error('YouTube 字幕格式無法辨識。');
      }
      const nodes = [...doc.querySelectorAll('transcript > text, body > p')];
      return nodes.map(node => {
        for (const br of node.querySelectorAll('br')) br.replaceWith(doc.createTextNode(' '));
        return node.textContent || '';
      });
    };
    const triedUrls = new Set();
    const fetchCues = async url => {
      ensureCurrent();
      const target = safeUrl(url.toString());
      if (triedUrls.has(target.href) || triedUrls.size >= 2) return null;
      triedUrls.add(target.href);
      const result = await fetch(target.href, { credentials: 'include', signal: AbortSignal.timeout(10000) });
      if (!result.ok) throw new Error(`字幕取得失敗（HTTP ${result.status}），請稍後重試。`);
      const text = await result.text();
      if (text.length > 12_000_000) throw new Error('字幕檔過大，暫時無法處理。');
      ensureCurrent();
      return parse(text);
    };
    let cues, lastError;
    try { cues = await fetchCues(observedUrl() || base); } catch (error) { lastError = error; }
    if (!cues?.some(text => text.trim())) {
      // Ask the actual player for this track so its own session supplies subtitle verification.
      // Never generate tokens, impersonate a different client, or change account settings.
      const previous = player?.getOption?.('captions', 'track');
      const wasOn = Boolean(previous?.languageCode);
      const canSwitch = typeof player?.setOption === 'function' && typeof player?.getOption === 'function';
      if (canSwitch) {
        try {
          player.loadModule?.('captions');
          player.setOption('captions', 'track', {
            languageCode: selected.language, vss_id: selected.vssId,
            name: base.searchParams.get('name') || '', kind: selected.rawKind || '',
          });
          for (let attempt = 0; attempt < 16; attempt++) {
            await pause(250);
            ensureCurrent();
            const url = observedUrl();
            if (url) {
              try { cues = await fetchCues(url); } catch (error) { lastError = error; }
              if (cues?.some(text => text.trim())) break;
            }
          }
        } finally {
          if (currentId() === request.video.id) {
            player.setOption('captions', 'track', wasOn ? previous : {});
          }
        }
      }
    }
    ensureCurrent();
    if (!cues?.some(text => text.trim())) {
      return fail(lastError?.message || 'YouTube 未回傳字幕內容。請先在影片播放器開啟所選語言字幕，再重新搜尋下載。');
    }
    return { ok: true, data: { title, language: selected.language, cues } };
  } catch (error) {
    if (['TimeoutError', 'AbortError'].includes(error?.name)) return fail('字幕請求逾時，請稍後重試。');
    return fail(error?.message === 'Failed to fetch' ? '無法連線至 YouTube，請檢查網路後重試。' : error?.message || 'YouTube 字幕取得失敗。');
  } finally { resourceObserver?.disconnect(); }
}
