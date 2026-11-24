// Serialized by browser.scripting into the MAIN world. Keep this function self-contained.
export async function youtubeRequest(request) {
  let resourceObserver, stopCapture;
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
    // A player URL may be stale or unusable when replayed. During a bounded
    // reload, read a copy of the player's own matching response instead.
    let capturedCues, lastError;
    const pageFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : fetch;
    const matchesTrack = value => {
      try {
        const url = safeUrl(String(value));
        return url.searchParams.get('lang') === base.searchParams.get('lang')
          && (url.searchParams.get('kind') || '') === (base.searchParams.get('kind') || '')
          && (url.searchParams.get('name') || '') === (base.searchParams.get('name') || '')
          && !url.searchParams.has('tlang');
      } catch { return false; }
    };
    const startCapture = () => {
      let active = true;
      const originalFetch = window.fetch;
      const prototype = window.XMLHttpRequest?.prototype;
      const originalOpen = prototype?.open, originalSend = prototype?.send;
      const urls = new WeakMap(), listeners = new Map();
      const accept = (text, url) => {
        if (!active || !matchesTrack(url)) return;
        try {
          ensureCurrent();
          if (typeof text !== 'string' || text.length > 12_000_000) return;
          const parsed = parse(text);
          if (parsed?.some(cue => cue.trim())) capturedCues = parsed;
        } catch (error) { lastError = error; }
      };
      function wrappedFetch(...args) {
        const response = Reflect.apply(originalFetch, this, args);
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || String(args[0]);
        if (matchesTrack(url)) {
          Promise.resolve(response).then(result => {
            const finalUrl = result.url || url;
            if (active && result.ok && matchesTrack(finalUrl)) {
              return result.clone().text().then(text => accept(text, finalUrl));
            }
          }).catch(() => { /* Never change the player's response or rejection. */ });
        }
        return response;
      }
      function wrappedOpen(method, url, ...rest) {
        const result = Reflect.apply(originalOpen, this, [method, url, ...rest]);
        if (matchesTrack(url)) urls.set(this, String(url));
        else urls.delete(this);
        return result;
      }
      function wrappedSend(...args) {
        if (urls.has(this)) {
          const onLoad = () => {
            this.removeEventListener('load', onLoad);
            listeners.delete(this);
            const url = this.responseURL || urls.get(this);
            if (this.status >= 200 && this.status < 300) {
              try {
                const text = this.responseType === 'json' ? JSON.stringify(this.response)
                  : !this.responseType || this.responseType === 'text' ? this.responseText : '';
                accept(text, url);
              } catch { /* A non-text response is not a readable subtitle. */ }
            }
          };
          listeners.set(this, onLoad);
          this.addEventListener('load', onLoad, { once: true });
        }
        return Reflect.apply(originalSend, this, args);
      }
      stopCapture = () => {
        active = false;
        if (window.fetch === wrappedFetch) window.fetch = originalFetch;
        if (prototype?.open === wrappedOpen) prototype.open = originalOpen;
        if (prototype?.send === wrappedSend) prototype.send = originalSend;
        for (const [xhr, listener] of listeners) xhr.removeEventListener('load', listener);
        listeners.clear();
      };
      if (typeof originalFetch === 'function') window.fetch = wrappedFetch;
      if (prototype && originalOpen && originalSend) {
        prototype.open = wrappedOpen;
        prototype.send = wrappedSend;
      }
    };
    const triedUrls = new Set();
    const fetchCues = async url => {
      ensureCurrent();
      const target = safeUrl(url.toString());
      if (triedUrls.has(target.href) || triedUrls.size >= 2) return null;
      triedUrls.add(target.href);
      const result = await pageFetch(target.href, { credentials: 'include', signal: AbortSignal.timeout(10000) });
      if (!result.ok) throw new Error(`字幕取得失敗（HTTP ${result.status}），請稍後重試。`);
      const text = await result.text();
      if (text.length > 12_000_000) throw new Error('字幕檔過大，暫時無法處理。');
      ensureCurrent();
      return parse(text);
    };
    let cues;
    try { cues = await fetchCues(observedUrl() || base); } catch (error) { lastError = error; }
    if (!cues?.some(text => text.trim())) {
      // Ask the actual player for this track so its own session supplies subtitle verification.
      // Never generate tokens, impersonate a different client, or change account settings.
      const previous = player?.getOption?.('captions', 'track');
      const wasOn = Boolean(previous?.languageCode);
      const canSwitch = typeof player?.setOption === 'function' && typeof player?.getOption === 'function';
      if (canSwitch) {
        try {
          startCapture();
          player.loadModule?.('captions');
          player.setOption('captions', 'track', {
            languageCode: selected.language, vss_id: selected.vssId,
            name: base.searchParams.get('name') || '', kind: selected.rawKind || '',
          });
          // Selecting a track already enabled in the UI does not reload it.
          player.setOption('captions', 'reload', true);
          for (let attempt = 0; attempt < 32; attempt++) {
            await pause(250);
            ensureCurrent();
            if (capturedCues) { cues = capturedCues; break; }
            const url = observedUrl();
            if (url) {
              try { cues = await fetchCues(url); } catch (error) { lastError = error; }
              if (cues?.some(text => text.trim())) break;
            }
          }
        } finally {
          stopCapture?.();
          if (currentId() === request.video.id) {
            player.setOption('captions', 'track', wasOn ? previous : {});
          }
        }
      }
    }
    ensureCurrent();
    if (!cues?.some(text => text.trim())) {
      return fail(lastError?.message || '播放器未提供可讀取的字幕內容。請重新整理影片後重試；若仍失敗，請回報影片網址與所選字幕語言。');
    }
    return { ok: true, data: { title, language: selected.language, cues } };
  } catch (error) {
    if (['TimeoutError', 'AbortError'].includes(error?.name)) return fail('字幕請求逾時，請稍後重試。');
    return fail(error?.message === 'Failed to fetch' ? '無法連線至 YouTube，請檢查網路後重試。' : error?.message || 'YouTube 字幕取得失敗。');
  } finally { stopCapture?.(); resourceObserver?.disconnect(); }
}
