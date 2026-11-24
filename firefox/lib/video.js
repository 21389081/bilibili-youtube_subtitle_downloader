export function identifyVideo(value) {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:') return null;
  if (['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(url.hostname)) {
    const id = url.pathname === '/watch'
      ? url.searchParams.get('v')
      : url.pathname.match(/^\/(?:shorts|live)\/([\w-]{11})\/?$/)?.[1];
    if (!/^[\w-]{11}$/.test(id || '')) return null;
    return { platform: 'youtube', id, key: `youtube:${id}` };
  }
  if (['www.bilibili.com', 'bilibili.com', 'm.bilibili.com'].includes(url.hostname)) {
    const id = url.pathname.match(/^\/video\/(BV[0-9A-Za-z]{10}|av\d+)\/?$/i)?.[1];
    const part = Number(url.searchParams.get('p') || 1);
    if (!id || !Number.isSafeInteger(part) || part < 1) return null;
    return { platform: 'bilibili', id, part, key: `bilibili:${id.toLowerCase()}:${part}` };
  }
  return null;
}

function safePart(value, fallback, maxBytes) {
  let text = String(value || '').normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '_')
    .replace(/\s+/g, ' ').replace(/\.{2,}/g, '.').trim().replace(/^[. ]+|[. ]+$/g, '');
  if (!text) text = fallback;
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(text)) text = `_${text}`;
  const encoder = new TextEncoder();
  let result = '';
  for (const char of text) {
    if (encoder.encode(result + char).length > maxBytes) break;
    result += char;
  }
  return result.replace(/[. ]+$/g, '') || fallback;
}

export function subtitleFilename(title, language) {
  return `${safePart(title, '影片字幕', 160)}.${safePart(language, 'und', 30)}.txt`;
}
