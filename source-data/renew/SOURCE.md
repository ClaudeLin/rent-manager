# 換證題庫來源與轉換紀錄

## 官方來源

- 下載頁：<https://rentalh.org.tw/down-list2.php?lmenuid=12&mpmid=2>
- 含法源／詳解版（115 年 02 月 06 日更新）：<https://rentalh.org.tw/public/downinfo/44_11776651645.pdf>
  - SHA-256：`90ef3499c80f284c4ab40690b6b631a143da5c7b0f6ffc729c4b4c737b6384a2`
- 不含法源版（115 年 02 月 06 日更新）：<https://rentalh.org.tw/public/downinfo/45_11776651677.pdf>
  - SHA-256：`f5fd3eaa754ee3423b09f7b3c24da26505ff68e4a218fcb35bdb3aa00e77dc14`
- 下載與轉換日期：2026-08-03

PDF 為官方換證版的文字層檔案；repository 不提交 PDF binary。注意：repo 根目錄同名「資格訓練」PDF 是 966 題初訓資料，不能作為本換證 converter 的輸入。

## 可重現轉換

```sh
curl --fail --location https://rentalh.org.tw/public/downinfo/44_11776651645.pdf -o /tmp/renew-with-law.pdf
curl --fail --location https://rentalh.org.tw/public/downinfo/45_11776651677.pdf -o /tmp/renew-without-law.pdf
shasum -a 256 /tmp/renew-with-law.pdf /tmp/renew-without-law.pdf
uv run --with pdfplumber==0.11.8 python scripts/convert_renewal_exam_pdf.py \
  /tmp/renew-with-law.pdf /tmp/renew-without-law.pdf \
  --with-law /tmp/questions_with_law.rebuilt.json \
  --without-law /tmp/questions_without_law.rebuilt.json
```

The command fail-closes unless both PDFs independently yield 379 valid questions and all stable keys, question text, A–D options, and answers match after the documented reconciliation. Review candidates are `/tmp/questions_{with,without}_law.rebuilt.json`; promote only after the semantic audit.

## Published files

- `questions_with_law_corrected.json`: 379 questions, each with a nonempty `law_reference`.
- `questions_without_law_corrected.json`: the matching 379 questions without `law_reference`.
- `public/data/renew/questions_{with,without}_law.json` are byte-identical runtime copies.
- `public/data/renew/question_annotations.json` is a deliberately separate, empty annotation sidecar.
