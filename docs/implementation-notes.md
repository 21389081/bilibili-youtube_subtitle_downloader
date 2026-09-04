# 技術依據與邊界

## 平台依據

- Chrome 官方：[Manifest V3 scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting)、[activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)、[downloads](https://developer.chrome.com/docs/extensions/reference/api/downloads)。
- YouTube 字幕驗證變更的實際案例：[yt-dlp issue #13075](https://github.com/yt-dlp/yt-dlp/issues/13075)。使用目前播放器提供的字幕網址及該影片的字幕資源請求，不自行產生驗證資訊。
- Bilibili 現行擷取實作的參考：[yt-dlp Bilibili extractor](https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/bilibili.py)。使用影片 `pages` 對應目前 P 的 `cid`，再呼叫 `/x/player/wbi/v2`；明確處理 `need_login_subtitle`。
- [Playwright 官方 Chrome extension testing](https://playwright.dev/docs/chrome-extensions)：使用獨立 Chromium profile 載入測試套件。

以上平台資料結構並非穩定的公開字幕 API 合約。實作需以真實影片回歸測試維護；不因失敗而自動改用語音辨識。

## 責任邊界

- `platforms/youtube.js`、`platforms/bilibili.js` 的函式由 `chrome.scripting` 序列化到 MAIN world，不能依赖函式外的變數或 import。平台資料均視為不可信輸入。
- `background.js` 只接受本插件 `popup.html` 的訊息；下載選項必須存在於該分頁已搜尋的字幕清單。頁面中途切換、字幕清單超過 30 分鐘皆要求重新搜尋。
- 不從一般頁面的訊息取得任意下載 URL。平台回傳 URL 另有 HTTPS 及主機／影片核對。
- TXT 檔以 UTF-8 BOM 及 CRLF 輸出，適合 Windows 文字編輯器。字幕文字透過 `textContent` 顯示，不插入為 HTML。
- 沒有需要以 ADR 固定的高成本架構決策；第一版的模組與平台策略可獨立替換。
