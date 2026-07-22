# 租賃住宅管理人員練習工具

以靜態題庫 JSON 提供全題練習、章節練習、120 分鐘模擬考與錯題回顧的前端網站。進入網站後須先選擇「有詳解題庫」或「只有答案題庫」；同一輪練習及同一場模擬考不會混用兩份資料。

> 本專案不需要將密碼、API 金鑰、正式網址或正式部署路徑寫入 Git。部署資訊只應設定於部署平台的環境變數。

## 先備條件

- Node.js（建議使用目前仍受支援的 LTS 版本）
- npm（隨 Node.js 安裝）

確認版本：

```bash
node --version
npm --version
```

## 本機啟動

Clone 專案後，在專案根目錄直接執行：

```bash
npm ci
npm run dev
```

本機開發不需要建立 `.env`，也不需要知道正式部署路徑。終端機會顯示實際來源網址；預設路由如下：

| 路徑 | 功能 |
|---|---|
| `/` | 選擇有詳解或只有答案題庫 |
| `/practice` | 全題庫隨機單題練習 |
| `/practice/chapter` | 選擇章節後隨機練習 |
| `/mock` | 120 分鐘、十章各十題模擬考 |
| `/wrong` | 作答統計、錯題回顧與錯題練習 |

題庫選擇保存在目前分頁的 `sessionStorage`，所以重新整理功能頁後仍會使用同一份題庫。可隨時由頁首的「更換題庫」返回入口重選。

## 常用指令

```bash
# 單元測試
npm test

# Desktop 與 Mobile E2E
npm run test:e2e

# 型別與 Astro 檢查
npm run typecheck

# 產生靜態檔案（預設以根路徑輸出至 dist/）
npm run build

# 預覽建置結果
npm run preview
```

## 部署至子路徑

本機預設使用根路徑。只有部署時才需要由平台注入：

```dotenv
PUBLIC_SITE_ORIGIN=https://yourdomain.example
PUBLIC_APP_PATH=/your/base/path
```

- `PUBLIC_SITE_ORIGIN`：公開來源網址。
- `PUBLIC_APP_PATH`：部署子路徑；每一段只接受英文字母、數字、連字號或底線。

設定後，入口與功能頁會自動加上該 Base，例如 `/your/base/path/practice`、`/your/base/path/mock`。HTML、Astro 資產及兩份 Runtime JSON 也會輸出至同一 Base。請只在部署平台設定正式值，不要提交正式網址或路徑。

Cloudflare Pages 泛用設定：

- **Build command**：`npm run build`
- **Build output directory**：`dist`
- **環境變數**：依部署環境設定 `PUBLIC_SITE_ORIGIN` 與 `PUBLIC_APP_PATH`

## 練習紀錄與重設

作答紀錄與錯題資料儲存在目前瀏覽器的 `localStorage`，不會自動同步到其他裝置或瀏覽器。可在 `/wrong` 使用「重設本機紀錄」；也可在瀏覽器開發者工具的 **Application／儲存空間** 清除網站資料。

## 題庫 Source of Truth

使用者確認的 corrected 原始來源位於 `source-data/`，不可由轉換程式直接覆寫：

- `source-data/questions_with_law_corrected.json`
- `source-data/questions_without_law_corrected.json`

網站實際載入的是 `public/data/` 的 Runtime 複本：

- `public/data/questions_with_law.json`
- `public/data/questions_without_law.json`

Runtime 題庫必須與 corrected 原檔逐 byte 相同；`npm test` 會驗證兩份題庫均為 966 題、keys／題目／選項／答案一致，並確認法源欄位只存在於 with-law 版本。

`.rebuilt.json` 及其他轉換中間產物只能作為比對候選，不得直接成為網站出題來源。更新題庫時應先逐題檢查與 corrected 的 semantic diff，人工確認後才同步至 `source-data/` 與 `public/data/`。

## 從官方 PDF 產生候選 JSON

`scripts/convert_rental_exam_pdf.py` 讀取「含法源依據」官方 PDF，輸出符合目前 schema 的兩份候選 JSON；without-law 版本會由 with-law 版本移除 `law_reference` 產生，確保兩者 keys、題目、選項及答案一致。

### 推薦：使用 uv 隔離執行

不需安裝 Python 套件至全域環境：

```bash
uv run --with pdfplumber==0.11.8 \
  python scripts/convert_rental_exam_pdf.py \
  "/path/to/official-with-law.pdf" \
  --expected-count 966
```

預設輸出至目前目錄：

- `questions_with_law.rebuilt.json`
- `questions_without_law.rebuilt.json`

也可明確指定輸出位置：

```bash
uv run --with pdfplumber==0.11.8 \
  python scripts/convert_rental_exam_pdf.py \
  "/path/to/official-with-law.pdf" \
  --with-law /tmp/questions_with_law.rebuilt.json \
  --without-law /tmp/questions_without_law.rebuilt.json \
  --expected-count 966
```

### 使用 Python venv

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r scripts/requirements-pdf-converter.txt
python scripts/convert_rental_exam_pdf.py \
  "/path/to/official-with-law.pdf" \
  --expected-count 966
```

### Converter regression tests

```bash
uv run --with pdfplumber==0.11.8 \
  python -m unittest scripts/test_convert_rental_exam_pdf.py
```

Converter 會 fail closed 驗證：

- 題數（有提供 `--expected-count` 時）
- chapter／section number 與中文 code 一致
- 題目 key 不重複、各節題號連續
- 每題恰有 A、B、C、D 四個非空選項
- answer 必須為 A–D 且不得為空
- with-law 每題法源不得為空
- 官方第十章無 subsection 時正規化為第一節「專業倫理規範」

為避免誤覆寫，輸出檔名若以 `_corrected.json` 結尾，程式會拒絕執行。雖可用 `--allow-corrected-overwrite` 明確解除保護，但正常流程不應使用；請輸出 `.rebuilt.json` 後再做 semantic diff 與人工審查。
