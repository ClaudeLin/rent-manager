# 換證 PDF 語意稽核

轉換器先各自解析官方「含法源」與「不含法源」PDF，然後比較 `(chapter_no, section_no, question_no)`、題幹、A–D 選項及答案。文字層的 Unicode whitespace 差異會在 comparison 時忽略；其他差異一律 fail closed，只有以下逐題人工稽核過的官方版本差異會由 `OFFICIAL_VARIANTS` 收斂成同一個已記錄的 canonical 值。

| Key | 欄位 | 含法源版 | 不含法源版 | Canonical／依據 |
| --- | --- | --- | --- | --- |
| c1-s2-q51 | D 選項 | `…之 2 人…公證。。`（layout spaces、重複句點） | `…之2人…公證。` | 不含法源版的完整標點文字 |
| c1-s4-q4 | D 選項 | `直接報請直轄市、縣 (市) 主管機關處罰` | `直接報請直轄市、縣(市)主管機關處罰。` | 不含法源版的完整標點文字 |
| c1-s4-q34 | B 選項 | `管委會主` | `管委會主委` | 不含法源版完整詞語；含法源表格原文被截斷 |
| c2-s1-q38 | 題幹 | `住宅租賃定型化契約…` | `住宅租賃契約…` | 含法源版，且與所引用的「住宅租賃定型化契約應記載及不得記載事項」名稱一致 |
| c3-s3-q5 | D 選項 | `1,000` | `1000` | 含法源版的數字分組格式 |

另外，含法源 c1-s4-q4 的 explanation 曾含重複表頭 `法源或來源依據`；這是跨頁表格 chrome，不是法條內容。`clean_law_reference` 移除該表頭以及落入 explanation 欄開頭的 `(A)`–`(D)` answer prefix。`renewal_options` 會移除 continuation option cell 的 `題目題號選項`／`題號題目選項答案` 重複表頭（回歸案例為 c1-s1-q37）。

這些規則與五筆 reconciliation 都有 converter regression tests。新增、未稽核或實質性的跨 PDF 差異不會被靜默覆蓋，而會讓 converter 失敗。
