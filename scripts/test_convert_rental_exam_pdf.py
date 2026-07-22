from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("convert_rental_exam_pdf.py")
SPEC = importlib.util.spec_from_file_location("convert_rental_exam_pdf", MODULE_PATH)
assert SPEC and SPEC.loader
converter = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(converter)


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

    def test_validator_rejects_empty_answer_and_invalid_metadata(self):
        question = {
            "chapter_no": 1,
            "chapter_code": "壹",
            "chapter_title": "章",
            "section_no": 1,
            "section_code": "一",
            "section_title": "節",
            "question_no": 1,
            "question": "題目",
            "options": [
                {"id": option, "text": option}
                for option in "ABCD"
            ],
            "answer": "",
            "law_reference": "法源",
        }
        self.assertTrue(any("answer=''" in error for error in converter.validate([question])))
        question["answer"] = "A"
        question["chapter_no"] = None
        self.assertTrue(any("invalid chapter number" in error for error in converter.validate([question])))

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


if __name__ == "__main__":
    unittest.main()
