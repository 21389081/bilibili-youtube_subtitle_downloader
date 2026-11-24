# Firefox / Zen 驗證紀錄

日期：2026-11-24。

## 已完成

- Node.js 24.16.0；web-ext 10.8.0。
- `npm test`：23 項通過（含 Firefox Promise API、一般／私密下載參數、訊息來源驗證、切換影片與共用來源檢查）。
- Chrome JavaScript / Manifest 檢查通過。
- Firefox JavaScript / Manifest 檢查通過。
- `web-ext lint --warnings-as-errors`：0 errors、0 warnings、0 notices。
- 既有 Chromium 彈窗排版回歸通過。
- Chrome `extension/` 的 13 個檔案與工作開始前逐位元組相同，Git 主分支亦保留。
- Firefox ZIP 根目錄包含 `manifest.json`，所有檔案與建置輸出相同。
- Zen 1.24.3b（Gecko 160.0.1）的獨立測試設定檔已成功暫時載入此擴充功能，私密視窗已開啟。使用者已手動允許私密視窗執行。

## 尚待使用者實測

依使用者要求，後續瀏覽器測試由使用者自行進行。本次沒有完成真實 YouTube / Bilibili 字幕下載驗證；自動測試與暫時載入成功不代表實際平台下載已通過。

開啟支援的影片後，按 `Alt+Shift+Y` 或點擴充功能按鈕，再點「開始下載」。

- YouTube：人工／自動字幕、切換語言、播放器字幕狀態恢復。
- Bilibili：已登入／未登入提示、一般影片與多分 P。
- 無字幕、切換影片、重新搜尋與網路錯誤。
- 下載 TXT 後確認繁體中文、逐段換行、重複段落與檔名。
- 私密視窗下載紀錄歸屬私密視窗，關閉彈窗後下載仍可完成。
- 一般視窗及下載前詢問開／關兩種設定。

測試設定檔的預設下載目錄為專案 `.qa/zen-downloads/`。該目錄、瀏覽器設定檔與任何測試下載內容均不提交到 GitHub，也不放入 Firefox ZIP。

ZIP 未經 Mozilla 簽章，請以暫時附加元件方式測試，或提交 AMO 取得正式簽章後再永久安裝。

## Firefox 0.1.2：修正原始資料夾缺檔

使用者實際載入 `firefox/manifest.json`，並回報介面無法開啟、圖示不顯示。0.1.1 的 `firefox/` 僅有 Manifest 和瀏覽器專用入口，沒有 `popup.html`、CSS、圖示及共用模組；只有 `dist/firefox/` 完整。

依使用者要求，本次不操作瀏覽器。檔案依賴檢查重現相同路徑的錯誤：

```text
node --test tests/firefox-files.test.js
Error: Missing extension file: popup.html (referenced by manifest.json)
```

補齊並提交共用檔案後，相同測試通過。檢查會沿 Manifest、彈窗 HTML 與 ES module imports 確認依賴存在；來源和建置版本均受檢查。Chrome 原始碼未修改。

本次修正涵蓋已確認的介面／圖示缺檔原因，沒有宣稱已完成瀏覽器實際操作或修正先前 YouTube 字幕請求問題。
