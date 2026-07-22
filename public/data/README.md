# 網站 Runtime 題庫

此目錄是 Astro 網站實際發布及載入的題庫複本：

- `questions_with_law.json`：複製自 `source-data/questions_with_law_corrected.json`。
- `questions_without_law.json`：複製自 `source-data/questions_without_law_corrected.json`。

請勿把 `.rebuilt.json` 或其他中間產物放入網站出題來源。更新 Runtime 檔案前，必須先驗證 corrected 原始來源的 JSON 格式、題數、唯一 Key、答案及兩版本一致性。
