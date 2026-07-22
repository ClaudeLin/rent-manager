# 題庫原始來源（Source of Truth）

此目錄保存使用者確認的 corrected JSON，作為題庫的唯一原始基準：

- `questions_with_law_corrected.json`：966 題，全部含法源／詳解。
- `questions_without_law_corrected.json`：966 題，只有答案，不含法源／詳解。

## 規則

- 網站不得直接載入本目錄檔案。
- 不要直接修改 corrected 原檔。
- 若需更新網站題庫，應先驗證原檔，再複製到 `public/data/` 對應的 Runtime 檔案。
- 兩種題庫為二選一來源；同一輪練習或同一場模擬考不得混合抽題。
