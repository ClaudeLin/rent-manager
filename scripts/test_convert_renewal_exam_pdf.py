import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from convert_renewal_exam_pdf import clean_law_reference, parse_options, normalize_answer, reconcile_official_variants, renewal_options, validate


class RenewalConverterTests(unittest.TestCase):
    def test_parse_options_keeps_four_choices_when_answer_prefix_is_in_source_column(self):
        self.assertEqual([item['id'] for item in parse_options('(A)甲(B)乙(C)丙(D)丁')], list('ABCD'))
        self.assertEqual(normalize_answer('（C）答案'), 'C')

    def test_repeated_table_header_is_not_an_option(self):
        self.assertEqual(renewal_options('(A)甲(B)乙(C)丙(D)丁題目題號選項'), [{'id': 'A', 'text': '甲'}, {'id': 'B', 'text': '乙'}, {'id': 'C', 'text': '丙'}, {'id': 'D', 'text': '丁'}])

    def test_law_cleanup_removes_header_and_displaced_answer_prefix(self):
        self.assertEqual(clean_law_reference('（B）法源或來源依據 租賃住宅市場發展及管理條例第 1 條'), '租賃住宅市場發展及管理條例第 1 條')

    def test_documented_official_variants_are_accepted_and_canonicalized(self):
        items = [
            {'chapter_no': 1, 'section_no': 2, 'question_no': 51, 'question': '題目', 'options': [{'id': 'A', 'text': '甲'}, {'id': 'B', 'text': '乙'}, {'id': 'C', 'text': '丙'}, {'id': 'D', 'text': '應由雙方當事人訂立無償借用契約，經雙方當事人以外之 2 人證明確係無償借用，並依公證法之規定辦竣公證。。'}], 'answer': 'D', 'law_reference': '法源或來源依據'},
            {'chapter_no': 1, 'section_no': 4, 'question_no': 4, 'question': '題目', 'options': [{'id': 'A', 'text': '甲'}, {'id': 'B', 'text': '乙'}, {'id': 'C', 'text': '丙'}, {'id': 'D', 'text': '直接報請直轄市、縣 (市) 主管機關處罰'}], 'answer': 'D', 'law_reference': ''},
            {'chapter_no': 1, 'section_no': 4, 'question_no': 34, 'question': '題目', 'options': [{'id': 'A', 'text': '甲'}, {'id': 'B', 'text': '管委會主'}, {'id': 'C', 'text': '丙'}, {'id': 'D', 'text': '丁'}], 'answer': 'B', 'law_reference': ''},
            {'chapter_no': 2, 'section_no': 1, 'question_no': 38, 'question': '依據住宅租賃契約應記載及不得記載事項中，於租賃期間承租人可提前終止租約之情形何者正確?', 'options': [{'id': x, 'text': x} for x in 'ABCD'], 'answer': 'A', 'law_reference': ''},
            {'chapter_no': 3, 'section_no': 3, 'question_no': 5, 'question': '題目', 'options': [{'id': 'A', 'text': '甲'}, {'id': 'B', 'text': '乙'}, {'id': 'C', 'text': '丙'}, {'id': 'D', 'text': '1000'}], 'answer': 'D', 'law_reference': ''},
        ]
        reconciled = reconcile_official_variants(items)
        self.assertEqual(reconciled[0]['options'][3]['text'], '應由雙方當事人訂立無償借用契約，經雙方當事人以外之2人證明確係無償借用，並依公證法之規定辦竣公證。')
        self.assertEqual(reconciled[1]['options'][3]['text'], '直接報請直轄市、縣(市)主管機關處罰。')
        self.assertEqual(reconciled[2]['options'][1]['text'], '管委會主委')
        self.assertIn('定型化契約', reconciled[3]['question'])
        self.assertEqual(reconciled[4]['options'][3]['text'], '1,000')

    def test_unexpected_official_variant_fails_closed(self):
        item = {'chapter_no': 1, 'section_no': 4, 'question_no': 34, 'question': '題目', 'options': [{'id': 'A', 'text': '甲'}, {'id': 'B', 'text': '未知職稱'}, {'id': 'C', 'text': '丙'}, {'id': 'D', 'text': '丁'}], 'answer': 'B', 'law_reference': ''}
        with self.assertRaisesRegex(RuntimeError, 'unexpected official variant'):
            reconcile_official_variants([item])

    def test_validate_rejects_empty_answer(self):
        item = {'chapter_no': 1, 'chapter_code': '壹', 'chapter_title': '完整標題', 'section_no': 1, 'section_code': '一', 'section_title': '完整節標題', 'question_no': 1, 'question': '題目', 'options': [{'id': x, 'text': x} for x in 'ABCD'], 'answer': '', 'law_reference': ''}
        self.assertTrue(any('invalid answer' in error for error in validate([item], expected_count=1, require_law=False)))

    def test_validate_rejects_missing_law_bad_sections_and_law_chrome(self):
        item = {'chapter_no': 1, 'chapter_code': '壹', 'chapter_title': '完整標題', 'section_no': 1, 'section_code': '一', 'section_title': '完整節標題', 'question_no': 1, 'question': '題目', 'options': [{'id': x, 'text': x} for x in 'ABCD'], 'answer': 'A', 'law_reference': ''}
        self.assertTrue(any('empty law_reference' in error for error in validate([item], expected_count=1)))
        item['law_reference'] = '（A）法源或來源依據 條文'
        errors = validate([item], expected_count=1)
        self.assertTrue(any('answer prefix' in error for error in errors))
        self.assertTrue(any('table header' in error for error in errors))


if __name__ == '__main__':
    unittest.main()
