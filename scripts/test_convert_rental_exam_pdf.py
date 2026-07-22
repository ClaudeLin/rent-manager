from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

MODULE_PATH = Path(__file__).with_name("convert_rental_exam_pdf.py")
SPEC = importlib.util.spec_from_file_location("convert_rental_exam_pdf", MODULE_PATH)
assert SPEC and SPEC.loader
converter = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(converter)


def sample_question():
    return {
        "chapter_no": 1,
        "chapter_code": "壹",
        "chapter_title": "章",
        "section_no": 1,
        "section_code": "一",
        "section_title": "節",
        "question_no": 1,
        "question": "題目",
        "options": [{"id": option, "text": option} for option in "ABCD"],
        "answer": "A",
        "law_reference": "法源",
    }


class ConverterTests(unittest.TestCase):
    def test_normalizes_fullwidth_and_stray_answer_parentheses(self):
        self.assertEqual(converter.normalize_answer("（Ｂ）"), "B")
        self.assertEqual(converter.normalize_answer("）(C)"), "C")
        self.assertEqual(converter.normalize_answer("(A)"), "A")
        self.assertEqual(converter.normalize_answer("答案 A"), "")

    def test_normalizes_fullwidth_option_markers(self):
        options = converter.parse_options("（Ａ）甲（Ｂ）乙（Ｃ）丙（Ｄ）丁")
        self.assertEqual([option["id"] for option in options], list("ABCD"))
        self.assertEqual([option["text"] for option in options], list("甲乙丙丁"))

    def test_does_not_silently_repair_duplicate_option_markers(self):
        options = converter.parse_options("(A)甲(B)乙(C)丙(C)丁")
        self.assertEqual([option["id"] for option in options], ["A", "B", "C", "C"])

    def test_validator_rejects_empty_answer_and_invalid_metadata(self):
        question = sample_question()
        question["answer"] = ""
        self.assertTrue(any("answer=''" in error for error in converter.validate([question])))
        question["answer"] = "A"
        question["chapter_no"] = None
        self.assertTrue(any("invalid chapter number" in error for error in converter.validate([question])))

    def test_validator_rejects_incomplete_bank_by_default(self):
        errors = converter.validate([sample_question()])
        self.assertTrue(any("count 1 != expected 966" in error for error in errors))
        self.assertTrue(any("missing chapters" in error for error in errors))

    def test_corrected_guard_rejects_case_variants_and_symlink_aliases(self):
        self.assertTrue(converter.refuses_corrected_output(Path("bank_corrected.JSON"), ()))
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            corrected = root / "source.json"
            corrected.write_text("[]", encoding="utf-8")
            alias = root / "alias.json"
            alias.symlink_to(corrected)
            self.assertTrue(converter.refuses_corrected_output(alias, (corrected,)))

    def test_output_alias_detection_is_case_insensitive(self):
        self.assertTrue(converter.paths_alias(Path("Same.json"), Path("same.JSON")))
        self.assertFalse(converter.paths_alias(Path("with.json"), Path("without.json")))

    def test_output_pair_refuses_existing_files_without_force(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with_law = root / "with.json"
            without_law = root / "without.json"
            with_law.write_text("old", encoding="utf-8")

            with self.assertRaises(FileExistsError):
                converter.write_output_pair(
                    with_law,
                    without_law,
                    "new-with",
                    "new-without",
                    overwrite=False,
                )

            self.assertEqual(with_law.read_text(encoding="utf-8"), "old")
            self.assertFalse(without_law.exists())

    def test_output_pair_writes_both_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with_law = root / "with.json"
            without_law = root / "without.json"
            converter.write_output_pair(
                with_law,
                without_law,
                json.dumps([{"law_reference": "法源"}]),
                json.dumps([{}]),
                overwrite=False,
            )
            self.assertEqual(json.loads(with_law.read_text(encoding="utf-8"))[0]["law_reference"], "法源")
            self.assertEqual(json.loads(without_law.read_text(encoding="utf-8")), [{}])

    def test_output_pair_rolls_back_both_files_when_second_install_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with_law = root / "with.json"
            without_law = root / "without.json"
            with_law.write_text("old-with", encoding="utf-8")
            without_law.write_text("old-without", encoding="utf-8")
            real_replace = converter.os.replace
            calls = 0

            def fail_second_install(source, destination):
                nonlocal calls
                calls += 1
                if calls == 4:
                    raise OSError("simulated second install failure")
                return real_replace(source, destination)

            with mock.patch.object(converter.os, "replace", side_effect=fail_second_install):
                with self.assertRaises(OSError):
                    converter.write_output_pair(
                        with_law,
                        without_law,
                        "new-with",
                        "new-without",
                        overwrite=True,
                    )

            self.assertEqual(with_law.read_text(encoding="utf-8"), "old-with")
            self.assertEqual(without_law.read_text(encoding="utf-8"), "old-without")
            self.assertEqual(sorted(path.name for path in root.iterdir()), ["with.json", "without.json"])


if __name__ == "__main__":
    unittest.main()
