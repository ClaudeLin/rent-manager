#!/usr/bin/env python3
"""Convert the official with-law rental exam PDF into repository-compatible JSON.

The converter derives the without-law variant from the parsed with-law records so
both variants always share keys, questions, choices, and answers. Generated files
are review candidates; they must not replace corrected source data without an
explicit opt-in and a semantic diff.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import pdfplumber

TABLE_SETTINGS = {
    "vertical_strategy": "lines",
    "horizontal_strategy": "lines",
    "snap_tolerance": 3,
    "join_tolerance": 3,
    "intersection_tolerance": 5,
}
CH_MAP = {code: index + 1 for index, code in enumerate("壹貳參肆伍陸柒捌玖")}
CH_MAP["拾"] = 10
SEC_MAP = {code: index + 1 for index, code in enumerate("一二三四五六七八九")}
SEC_MAP["十"] = 10
FULLWIDTH_TO_ASCII = str.maketrans("ＡＢＣＤ", "ABCD")
OPTION_MARKER = re.compile(r"\(([A-DＡ-Ｄ])\)")
ANSWER = re.compile(r"\(?\s*([A-DＡ-Ｄ])\s*\)?")
HEADER_TOKENS = {"題號", "題目", "選項", "答案", "法源或來源依據"}


def clean(value: str | None) -> str:
    if not value:
        return ""
    value = value.replace("\u3000", " ").replace("\r", "\n")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\s*\n\s*", "", value)
    return value.strip()


def strip_question_count(value: str) -> str:
    return re.sub(r"\(\s*\d+\s*題\s*\)$", "", value).strip()


def top_headings(page):
    tables = page.find_tables(TABLE_SETTINGS)
    top = min((table.bbox[1] for table in tables), default=160)
    text = page.crop((0, 0, page.width, max(0, top - 2))).extract_text(
        x_tolerance=2,
        y_tolerance=2,
    ) or ""
    chapter = section = None
    for raw in text.splitlines():
        line = clean(raw)
        match = re.match(r"^([壹貳參肆伍陸柒捌玖拾]+)、(.+)$", line)
        if match:
            chapter = (match.group(1), re.sub(r"\s+", " ", match.group(2)).strip())
            continue
        match = re.match(
            r"^([一二三四五六七八九十]+)、(.+?)(?:\(\s*\d+\s*題\s*\))?$",
            line,
        )
        if match:
            section = (match.group(1), re.sub(r"\s+", " ", match.group(2)).strip())
    return chapter, section


def logical_columns(table_bbox):
    x0, _, x1, _ = table_bbox
    # Official with-law layout is approximately 8%, 27%, 24%, 8%, 33%.
    widths = [0.0783, 0.2712, 0.2410, 0.0783, 0.3312]
    cuts = [x0]
    for width in widths:
        cuts.append(cuts[-1] + (x1 - x0) * width)
    cuts[-1] = x1
    return list(zip(cuts[:-1], cuts[1:]))


def assign_cell(cell, columns):
    x0, _, x1, _ = cell
    overlaps = [max(0, min(x1, right) - max(x0, left)) for left, right in columns]
    return max(range(len(columns)), key=lambda index: overlaps[index])


def iter_logical_rows(page):
    for table in page.find_tables(TABLE_SETTINGS):
        columns = logical_columns(table.bbox)
        for row in table.rows:
            values = [""] * 5
            seen = set()
            for cell in row.cells:
                if cell is None or cell in seen:
                    continue
                seen.add(cell)
                column = assign_cell(cell, columns)
                text = clean(page.crop(cell).extract_text(x_tolerance=2, y_tolerance=2))
                if text:
                    values[column] += text
            yield values


def parse_options(text: str):
    normalized = text.replace("（", "(").replace("）", ")")
    matches = list(OPTION_MARKER.finditer(normalized))
    options = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(normalized)
        options.append({
            "id": match.group(1).translate(FULLWIDTH_TO_ASCII),
            "text": clean(normalized[match.end():end]),
        })

    # A known official source row repeats a marker. The table always contains four
    # ordered choices, so a four-choice row is repaired by position and validated.
    if len(options) == 4 and [option["id"] for option in options] != list("ABCD"):
        for option, expected in zip(options, "ABCD"):
            option["id"] = expected
    return options


def normalize_answer(text: str) -> str:
    normalized = text.replace("（", "(").replace("）", ")")
    normalized = re.sub(r"^[)\s]+", "", normalized)
    match = ANSWER.fullmatch(normalized)
    return match.group(1).translate(FULLWIDTH_TO_ASCII) if match else ""


def parse_pdf(pdf_path: Path):
    records = []
    current = None
    chapter_code = chapter_title = section_code = section_title = None

    with pdfplumber.open(pdf_path) as pdf:
        for page_index, page in enumerate(pdf.pages):
            chapter, section = top_headings(page)
            if chapter:
                next_chapter_code, next_chapter_title = chapter
                if next_chapter_code != chapter_code:
                    section_code = section_title = None
                chapter_code, chapter_title = next_chapter_code, next_chapter_title
            if section:
                section_code, section_title = section

            for columns in iter_logical_rows(page):
                question_id = clean(columns[0])
                joined = "".join(columns)
                if any(clean(value) in HEADER_TOKENS for value in columns) or any(
                    heading in joined for heading in ("法源或來源依據", "題目選項答案")
                ):
                    continue
                match = re.fullmatch(r"0*(\d{1,3})", question_id)
                if match:
                    if current:
                        records.append(current)
                    if not chapter_code or not chapter_title:
                        raise RuntimeError(
                            f"Page {page_index + 1}: question before chapter heading"
                        )
                    # The official chapter 10 source intentionally has no subsection.
                    if not section_code and chapter_code == "拾":
                        section_code, section_title = "一", chapter_title
                    if not section_code or not section_title:
                        raise RuntimeError(
                            f"Page {page_index + 1}: question before section heading"
                        )
                    current = {
                        "chapter_no": CH_MAP.get(chapter_code),
                        "chapter_code": chapter_code,
                        "chapter_title": strip_question_count(chapter_title),
                        "section_no": SEC_MAP.get(section_code),
                        "section_code": section_code,
                        "section_title": strip_question_count(section_title),
                        "question_no": int(match.group(1)),
                        "_question": clean(columns[1]),
                        "_options": clean(columns[2]),
                        "_answer": clean(columns[3]),
                        "_law": clean(columns[4]),
                    }
                elif current:
                    current["_question"] += clean(columns[1])
                    current["_options"] += clean(columns[2])
                    current["_answer"] += clean(columns[3])
                    current["_law"] += clean(columns[4])
        if current:
            records.append(current)

    result = []
    for record in records:
        item = {key: value for key, value in record.items() if not key.startswith("_")}
        item["question"] = clean(record["_question"])
        item["options"] = parse_options(record["_options"])
        item["answer"] = normalize_answer(record["_answer"])
        item["law_reference"] = clean(record["_law"])
        result.append(item)
    return result


def validate(items):
    errors = []
    seen = set()
    by_section = {}
    for question in items:
        key = (
            question["chapter_no"],
            question["section_no"],
            question["question_no"],
        )
        if key in seen:
            errors.append(f"duplicate {key}")
        seen.add(key)
        by_section.setdefault(key[:2], []).append(key[2])

        if question["chapter_no"] not in range(1, 11):
            errors.append(f"{key}: invalid chapter number")
        if question["section_no"] not in range(1, 11):
            errors.append(f"{key}: invalid section number")
        if CH_MAP.get(question["chapter_code"]) != question["chapter_no"]:
            errors.append(f"{key}: inconsistent chapter code")
        if SEC_MAP.get(question["section_code"]) != question["section_no"]:
            errors.append(f"{key}: inconsistent section code")
        if not question["chapter_title"] or not question["section_title"]:
            errors.append(f"{key}: empty heading")
        if not question["question"]:
            errors.append(f"{key}: empty question")
        option_ids = [option["id"] for option in question["options"]]
        if option_ids != list("ABCD"):
            errors.append(f"{key}: options={option_ids}")
        if any(not option["text"] for option in question["options"]):
            errors.append(f"{key}: empty option")
        if question["answer"] not in {"A", "B", "C", "D"}:
            errors.append(f"{key}: answer={question['answer']!r}")
        if not question["law_reference"]:
            errors.append(f"{key}: empty law_reference")

    for section, numbers in by_section.items():
        expected = list(range(1, max(numbers) + 1))
        if numbers != expected:
            errors.append(
                f"{section}: non-contiguous {numbers[:5]}...{numbers[-5:]}"
            )
    return errors


CORRECTED_SOURCES = (
    Path(__file__).resolve().parents[1] / "source-data/questions_with_law_corrected.json",
    Path(__file__).resolve().parents[1] / "source-data/questions_without_law_corrected.json",
)


def paths_alias(left: Path, right: Path) -> bool:
    """Return true when two paths can resolve to the same output file."""
    left = left.expanduser()
    right = right.expanduser()
    if left.exists() and right.exists():
        try:
            if left.samefile(right):
                return True
        except OSError:
            pass
    return str(left.resolve(strict=False)).casefold() == str(
        right.resolve(strict=False)
    ).casefold()


def refuses_corrected_output(
    path: Path, corrected_sources: tuple[Path, ...] = CORRECTED_SOURCES
) -> bool:
    return path.name.casefold().endswith("_corrected.json") or any(
        paths_alias(path, corrected) for corrected in corrected_sources
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Convert the official with-law rental exam PDF to JSON."
    )
    parser.add_argument("pdf", type=Path, help="Official PDF with law/source references")
    parser.add_argument(
        "--with-law",
        type=Path,
        default=Path("questions_with_law.rebuilt.json"),
    )
    parser.add_argument(
        "--without-law",
        type=Path,
        default=Path("questions_without_law.rebuilt.json"),
    )
    parser.add_argument("--expected-count", type=int, default=None)
    parser.add_argument(
        "--allow-corrected-overwrite",
        action="store_true",
        help="Allow output filenames ending in _corrected.json (unsafe without review)",
    )
    args = parser.parse_args()

    outputs = (args.with_law, args.without_law)
    if paths_alias(*outputs):
        parser.error("with-law and without-law outputs must be different files")
    if not args.allow_corrected_overwrite and any(
        refuses_corrected_output(path) for path in outputs
    ):
        parser.error(
            "refusing to write *_corrected.json without --allow-corrected-overwrite"
        )

    items = parse_pdf(args.pdf)
    errors = validate(items)
    if args.expected_count is not None and len(items) != args.expected_count:
        errors.insert(0, f"count {len(items)} != expected {args.expected_count}")
    if errors:
        print(f"Validation failed with {len(errors)} error(s):", file=sys.stderr)
        for error in errors[:100]:
            print(f" - {error}", file=sys.stderr)
        return 1

    for output in outputs:
        output.parent.mkdir(parents=True, exist_ok=True)
    args.with_law.write_text(
        json.dumps(items, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    stripped = [
        {key: value for key, value in question.items() if key != "law_reference"}
        for question in items
    ]
    args.without_law.write_text(
        json.dumps(stripped, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"OK: {len(items)} questions")
    print(args.with_law.resolve())
    print(args.without_law.resolve())
    return 0


if __name__ == "__main__":
    sys.exit(main())
