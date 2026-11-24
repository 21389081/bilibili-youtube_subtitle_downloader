// Cue boundaries and repeated cues are intentional. Never merge or deduplicate.
export function cuesToText(cues) {
  if (!Array.isArray(cues) || cues.some(cue => typeof cue !== 'string')) {
    throw new Error('字幕格式無法辨識，請重新搜尋後再試。');
  }
  const lines = cues.map(cue => cue.replace(/\r\n|[\r\n\u2028\u2029]/g, ' ')
    .replace(/\u0000/g, '').trim()).filter(Boolean);
  if (!lines.length) throw new Error('字幕內容是空的，請在影片播放器開啟字幕後重新搜尋。');
  return `${lines.join('\r\n')}\r\n`;
}

export function textDataUrl(text) {
  // BOM makes Traditional Chinese reliably readable in Windows text editors.
  return `data:text/plain;charset=utf-8,${encodeURIComponent('\uFEFF' + text)}`;
}
