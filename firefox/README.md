# Firefox 桌面版

Firefox 140+，也供相容版本的 Zen Browser 使用。Chrome 正式版原始碼仍在 `extension/`，沒有修改；Chrome 原有的 `npm run package` 不變。

## 原始碼與打包

- `firefox/manifest.json`：Firefox Manifest V3、固定擴充功能 ID、資料傳輸聲明。
- `firefox/background.js`、`firefox/popup.js`：使用 Firefox Promise API 的瀏覽器入口。
- `firefox/` 是完整可載入的擴充功能資料夾，包含彈窗 HTML、CSS、圖示與模組；可在乾淨 checkout 直接選取 `firefox/manifest.json`，不必先打包。
- Bilibili 擷取、文字轉換、影片識別、HTML 與圖示以 `extension/` 為來源，在 `firefox/` 保留相同副本。YouTube 擷取及彈窗 CSS 是 Firefox 專用版本，不受同步命令覆蓋。`npm.cmd run sync:firefox` 可同步共用檔案，打包時亦會同步既有檔案，且不會修改 Chrome 來源；Firefox 專用入口不會被覆蓋。
- `dist/firefox/` 是完整可載入資料夾，由打包腳本產生，不提交到 Git。
- `gecko_android` 最低版本僅避免資料聲明相容性警告；本版本尚未驗收 Android，上架時只選桌面平台。

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run check
npm.cmd run check:firefox
npm.cmd run lint:firefox
npm.cmd run test:firefox-layout
npm.cmd run package:firefox
```

ZIP：`dist/subtitle-text-downloader-firefox-0.1.3.zip`。壓縮檔根目錄直接包含 `manifest.json`。

## 暫時載入與 Zen 測試

1. 直接使用此儲存庫的完整 `firefox/` 資料夾；若要建立發布用輸出，再執行 `npm.cmd run build:firefox`。
2. 開啟 Firefox / Zen 的 `about:debugging#/runtime/this-firefox`。
3. 選「載入暫時附加元件」，選取 **`firefox/manifest.json`**（`dist/firefox/manifest.json` 也是完整建置版本）。
4. 開啟 YouTube 或 Bilibili 影片，從擴充功能選單點「字幕下載」，或按 `Alt+Shift+Y` 開啟彈窗，再點「開始下載」。Zen 隱藏擴充功能按鈕時也可使用此快捷鍵。
5. 私密視窗測試需允許此擴充功能在私密視窗執行；此權限由使用者控制。一般視窗下載不會因此改為私密下載。

也可以用官方開發工具啟動全新測試設定檔，不使用日常登入資料：

```powershell
node node_modules/web-ext/bin/web-ext.js run --source-dir dist/firefox --firefox "C:\Program Files\Zen Browser\zen.exe"
```

暫時附加元件在結束瀏覽器後移除。上述 ZIP 未經 Mozilla 簽章，供開發測試或 AMO 提交，不能當作已簽章版本直接永久安裝。

## 資料與下載

Manifest 的 `browsingActivity` 宣告涵蓋使用者要求字幕時傳給 YouTube / Bilibili 的影片與字幕請求資訊；不代表開發者會收到資料。詳見 [Firefox 隱私政策](PRIVACY.md)。

Firefox 私密視窗下載會帶入 `incognito: true`，使該筆下載紀錄歸屬私密視窗。TXT 檔仍會寫入使用者選擇的磁碟位置，關閉私密視窗不會刪除已下載檔案。

## 上架

在 AMO 建立獨立 Firefox 項目，選擇桌面平台，提供 Firefox 隱私政策、截圖及審查步驟。若審查需要來源，提交此儲存庫原始碼及以上重建命令，不包含 `node_modules/`、`.qa/` 或使用者資料。固定 ID 不應在後續更新中更換。Chrome Web Store 項目與 Chrome 原始碼獨立保留。

驗證範圍與待測清單：[TESTING.md](TESTING.md)。

Firefox 修補版本獨立管理；目前 Firefox 0.1.3 不改動 Chrome 0.1.1。先前已從 `firefox/manifest.json` 暫時載入的使用者，在 `about:debugging` 點「重新載入」即可讀取補齊的檔案。

Firefox 0.1.3 修正字幕已開啟時的重新載入及讀取流程，錯誤訊息可換行，過長內容可在彈窗內捲動閱讀。
