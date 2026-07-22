# 租賃住宅管理人員練習工具

以靜態題庫 JSON 提供練習、模擬考與錯題複習的前端網站。進入網站後須先選擇「有詳解題庫」或「只有答案題庫」；同一輪練習及同一場模擬考不會混用兩份資料。專案可完全在本機執行，也可部署為靜態網站。

> 本專案不需要將密碼、API 金鑰或正式站點資訊寫入 Git。請只在自己的 `.env` 保存個人部署設定。

## 先備條件

- Node.js（建議使用目前仍受支援的 LTS 版本）
- npm（隨 Node.js 安裝）

確認版本：

```bash
node --version
npm --version
```

## 本機啟動

Clone 專案後，在專案根目錄執行：

```bash
npm ci
cp .env.example .env
```

開啟 `.env`，依自己的執行或部署環境設定：

```dotenv
PUBLIC_SITE_ORIGIN=https://yourdomain.example
PUBLIC_APP_PATH=/your/base/path
```

- `PUBLIC_SITE_ORIGIN`：網站的公開來源網址；本機練習可維持範例值，部署前再改為自己的網站來源。
- `PUBLIC_APP_PATH`：網站部署的非根目錄子路徑，請使用以 `/` 開頭的路徑，例如 `/your/base/path`。本工具不提供網站根首頁；根路徑找不到或回傳 404 是預期行為。

接著啟動開發伺服器：

```bash
npm run dev
```

終端機會顯示本機來源網址。請開啟該來源網址加上 `PUBLIC_APP_PATH`，例如 `http://localhost:4321/your/base/path/`；根路徑 `/` 預期找不到或回傳 404。若埠號已被使用，請以終端機實際輸出為準。

## 常用指令

```bash
# 單元測試
npm test

# 型別與 Astro 檢查
npm run typecheck

# 產生正式靜態檔案（輸出至 dist/）
npm run build

# 預覽正式建置結果（請先執行 npm run build）
npm run preview
```

`npm run preview` 會顯示包含 `PUBLIC_APP_PATH` 的預覽網址；請開啟完整子路徑，不要開啟網站根目錄。

## 練習紀錄與重設

作答紀錄與錯題資料儲存在目前瀏覽器的 `localStorage`，不會自動同步到其他裝置或瀏覽器。

若要重設本機練習資料，可使用網站提供的重設功能；若介面沒有可用按鈕，請在瀏覽器開發者工具的 **Application／儲存空間** 中清除這個網站的 Local Storage（或清除該網站資料）後重新整理頁面。此操作會移除該瀏覽器在本機保存的練習紀錄。

## 靜態題庫 JSON

使用者確認的 corrected 原始來源位於 `source-data/`，不可直接修改：

- `source-data/questions_with_law_corrected.json`
- `source-data/questions_without_law_corrected.json`

網站實際發布及載入的是 `public/data/` 的 Runtime 複本：

- `public/data/questions_without_law.json`：不含法源依據的題庫
- `public/data/questions_with_law.json`：含法源依據的題庫

建置時會把 Runtime 題庫與 Astro 資產一併放入 `PUBLIC_APP_PATH` 對應的輸出目錄。請勿將題庫檔案加入 `.gitignore`。若更新題庫，必須先驗證 `source-data/` 的 corrected 原檔，再複製到 `public/data/`；不得把 `.rebuilt.json` 或其他中間產物當成出題來源。

## Cloudflare Pages（泛用設定）

建立靜態網站專案時，使用下列建置設定：

- **Build command**：`npm run build`
- **Build output directory**：`dist`
- **環境變數**：依部署環境設定 `PUBLIC_SITE_ORIGIN` 與 `PUBLIC_APP_PATH`

請在部署平台的環境變數設定中輸入自己的值，不要將正式網址、帳號、專案識別資訊、權杖或其他機密寫入版本控制。
