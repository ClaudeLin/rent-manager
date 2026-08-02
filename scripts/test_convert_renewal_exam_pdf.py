import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from convert_renewal_exam_pdf import (
    clean_law_reference,
    parse_options,
    normalize_answer,
    reconcile_official_variants,
    renewal_options,
    validate,
)


class RenewalConverterTests(unittest.TestCase):
    def test_parse_options_keeps_four_choices_when_answer_prefix_is_in_source_column(self):
        self.assertEqual([item['id'] for item in parse_options('(A)甲(B)乙(C)丙(D)丁')], list('ABCD'))
        self.assertEqual(normalize_answer('（C）答案'), 'C')

    def test_repeated_table_header_is_not_an_option(self):
        options = renewal_options('(A)甲(B)乙(C)丙(D)丁題目題號選項')
        self.assertEqual(options, [
            {'id': 'A', 'text': '甲'}, {'id': 'B', 'text': '乙'},
            {'id': 'C', 'text': '丙'}, {'id': 'D', 'text': '丁'},
        ])

    def test_law_cleanup_removes_header_and_displaced_answer_prefix(self):
        self.assertEqual(clean_law_reference('（B）法源或來源依據 租賃住宅市場發展及管理條例第 1 條'), '租賃住宅市場發展及管理條例第 1 條')

    def test_documented_official_variants_have_one_canonical_value(self):
        items = [{
            'chapter_no': 1, 'section_no': 4, 'question_no': 34,
            'question': '題目',
            'options': [
                {'id': 'A', 'text': '甲'}, {'id': 'B', 'text': '管委會主'},
                {'id': 'C', 'text': '丙'}, {'id': 'D', 'text': '丁'},
            ],
            'answer': 'B', 'law_reference': '法源或來源依據 （B）依據規定',
        }]
        self.assertEqual(reconcile_official_variants(items)[0], {
            'chapter_no': 1, 'section_no': 4, 'question_no': 34,
            'question': '題目',
            'options': [
                {'id': 'A', 'text': '甲'}, {'id': 'B', 'text': '管委會主委'},
                {'id': 'C', 'text': '丙'}, {'id': 'D', 'text': '丁'},
            ],
            'answer': 'B', 'law_reference': '依據規定',
        })

    def test_validate_rejects_missing_law_bad_sections_and_law_chrome(self):
        item = {'chapter_no': 1, 'chapter_code': '壹', 'chapter_title': '完整標題', 'section_no': 1, 'section_code': '一', 'section_title': '完整節標題', 'question_no': 1, 'question': '題目', 'options': [{'id': x, 'text': x} for x in 'ABCD'], 'answer': 'A', 'law_reference': ''}
        self.assertTrue(any('empty law_reference' in error for error in validate([item], expected_count=1)))
        item['law_reference'] = '（A）法源或來源依據 條文'
        errors = validate([item], expected_count=1)
        self.assertTrue(any('answer prefix' in error for error in errors))
        self.assertTrue(any('table header' in error for error in errors))


if __name__ == '__main__':
    unittest.main()
