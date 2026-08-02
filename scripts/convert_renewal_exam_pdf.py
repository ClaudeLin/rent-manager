#!/usr/bin/env python3
"""Fail-closed converter for the official 2026-02-06 renewal question banks."""
from __future__ import annotations
import argparse, hashlib, json, re, sys
from pathlib import Path
import pdfplumber
from convert_rental_exam_pdf import clean, parse_options, normalize_answer, write_output_pair, refuses_corrected_output

TABLE = {'vertical_strategy':'lines','horizontal_strategy':'lines','snap_tolerance':3,'join_tolerance':3,'intersection_tolerance':5}
CH = {x:i+1 for i,x in enumerate('壹貳參')}; SEC = {x:i+1 for i,x in enumerate('一二三四五')}
EXPECTED = {(1,1):37,(1,2):59,(1,3):18,(1,4):37,(1,5):20,(2,1):60,(2,2):36,(3,1):46,(3,2):44,(3,3):22}

def headings(page):
    # Question text can itself begin with Chinese section markers; inspect only
    # the physical header area above the first table.
    tables = page.find_tables(TABLE)
    top = min((table.bbox[1] for table in tables), default=page.height)
    text = page.crop((0, 0, page.width, top)).extract_text() or ''
    chapter = section = None
    for raw in text.splitlines():
        line = clean(raw)
        m = re.match(r'^([壹貳參])、(.+)$', line)
        if m: chapter = (m.group(1), re.sub(r'\(\s*\d+\s*題\s*\)$','',m.group(2)).strip())
        m = re.match(r'^([一二三四五])、(.+?)(?:\(\s*\d+\s*題\s*\))?$', line)
        if m: section = (m.group(1), re.sub(r'\(\s*\d+\s*題\s*\)$','',m.group(2)).strip())
    return chapter, section

def renewal_options(text):
    # Repeated table headers sometimes become part of a continuation cell (in
    # particular c1-s1-q37).  They are layout chrome, never option content.
    return parse_options(re.sub(r'(?:題目題號選項|題號題目選項答案)', '', text))

def clean_law_reference(text):
    """Remove table chrome and a displaced answer marker from an explanation."""
    text = clean(text).replace('法源或來源依據', '')
    text = clean(text)
    text = re.sub(r'^(?:答案\s*[:：]?\s*)?[（(][A-DＡ-Ｄ][）)]\s*', '', text)
    return clean(text)

# The two separately published official PDFs have five, auditable editorial
# variants.  This is a source reconciliation table, not a parser fallback: all
# other semantic differences fail closed.  Each canonical value is corroborated
# by the other official edition and recorded in source-data/renew/SEMANTIC_AUDIT.md.
OFFICIAL_VARIANTS = {
    (1, 2, 51, 'D'): {'canonical': '應由雙方當事人訂立無償借用契約，經雙方當事人以外之2人證明確係無償借用，並依公證法之規定辦竣公證。', 'observed': ('應由雙方當事人訂立無償借用契約，經雙方當事人以外之 2 人證明確係無償借用，並依公證法之規定辦竣公證。。', '應由雙方當事人訂立無償借用契約，經雙方當事人以外之2人證明確係無償借用，並依公證法之規定辦竣公證。')},
    (1, 4, 4, 'D'): {'canonical': '直接報請直轄市、縣(市)主管機關處罰。', 'observed': ('直接報請直轄市、縣 (市) 主管機關處罰', '直接報請直轄市、縣(市)主管機關處罰。')},
    (1, 4, 34, 'B'): {'canonical': '管委會主委', 'observed': ('管委會主', '管委會主委')},
    (2, 1, 38, 'question'): {'canonical': '依據住宅租賃定型化契約應記載及不得記載事項中，於租賃期間承租人可提前終止租約之情形何者正確?', 'observed': ('依據住宅租賃定型化契約應記載及不得記載事項中，於租賃期間承租人可提前終止租約之情形何者正確?', '依據住宅租賃契約應記載及不得記載事項中，於租賃期間承租人可提前終止租約之情形何者正確?')},
    (3, 3, 5, 'D'): {'canonical': '1,000', 'observed': ('1,000', '1000')},
}

def reconcile_official_variants(items):
    """Accept only audited source values, then emit their documented canonical text."""
    def reconcile(key, value):
        variant = OFFICIAL_VARIANTS.get(key)
        if not variant: return value
        if semantic_text(value) not in {semantic_text(observed) for observed in variant['observed']}:
            raise RuntimeError(f'unexpected official variant at {key}: {value!r}')
        return variant['canonical']
    for question in items:
        key = (question['chapter_no'], question['section_no'], question['question_no'])
        for option in question['options']:
            option['text'] = reconcile((*key, option['id']), option['text'])
        question['question'] = reconcile((*key, 'question'), question['question'])
        question['law_reference'] = clean_law_reference(question['law_reference'])
    return items

def parse(pdf_path: Path, with_law: bool):
    records=[]; current=None; chapter=section=None
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            found_ch, found_sec = headings(page)
            if found_ch: chapter=found_ch
            if found_sec: section=found_sec
            for table in page.find_tables(TABLE):
                for row in table.extract():
                    cells=[clean(x) for x in row]
                    number=cells[0] if cells and re.fullmatch(r'0*\d{1,3}', cells[0] or '') else ''
                    if not number:
                        # A long cell can continue in a following physical table row.
                        if current:
                            if with_law:
                                if len(cells) <= 5:
                                    for field, index in (('question', 1), ('_options', 2), ('answer', 3), ('law_reference', 4)):
                                        if index < len(cells) and cells[index]: current[field] = clean(current.get(field, '') + cells[index])
                                else:
                                    for field, index in (('question', 3), ('_options', 6), ('answer', 9)):
                                        if index < len(cells) and cells[index]: current[field] = clean(current.get(field, '') + cells[index])
                                    law_fragment = ''.join(cells[12:])
                                    if law_fragment: current['law_reference'] = clean(current.get('law_reference', '') + law_fragment)
                            else:
                                nonempty = [x for x in cells if x]
                                if nonempty: current['_question_options'] = clean(current.get('_question_options', '') + nonempty[0])
                                if len(nonempty) > 1: current['answer'] = clean(current['answer'] + nonempty[1])
                        continue
                    if not chapter or not section: raise RuntimeError('question before heading')
                    if current:
                        if with_law:
                            current['options']=renewal_options(current.pop('_options'))
                        else:
                            text=current.pop('_question_options')
                            marker=re.search(r'[（(][A-DＡ-Ｄ][）)]', text)
                            current['question']=clean(text[:marker.start()] if marker else text)
                            current['options']=renewal_options(text[marker.start():] if marker else '')
                        current['answer']=normalize_answer(current['answer'])
                        records.append(current)
                    if with_law:
                        if len(cells) <= 5:
                            values=(cells[1:5]+['']*4)[:4]
                        else:
                            values=[cells[i] if i < len(cells) else '' for i in (3,6,9,12)]
                            # Some continuation law cells occupy the final merged column.
                            values[3] = ''.join(cells[12:])
                        # renewal with-law tables use both 15-column and compact 5-column families
                        if not any(values):
                            nonempty=[x for x in cells if x and x != number]
                            values=(nonempty+['']*4)[:4]
                        question, options, answer, law=values
                    else:
                        nonempty=[x for x in cells if x and x != number]
                        question_options=nonempty[0] if nonempty else ''
                        answer=nonempty[1] if len(nonempty)>1 else ''
                        marker=re.search(r'[（(][A-DＡ-Ｄ][）)]', question_options)
                        question=question_options[:marker.start()] if marker else question_options
                        options=question_options[marker.start():] if marker else ''
                        law=''
                    current={'chapter_no':CH[chapter[0]],'chapter_code':chapter[0],'chapter_title':chapter[1],'section_no':SEC[section[0]],'section_code':section[0],'section_title':section[1],'question_no':int(number),'question':clean(question),'_options':clean(options),'answer':clean(answer),'law_reference':clean(law)}
                    if not with_law: current['_question_options'] = question_options
    if current:
        if with_law: current['options']=renewal_options(current.pop('_options'))
        else:
            text=current.pop('_question_options'); marker=re.search(r'[（(][A-DＡ-Ｄ][）)]', text); current['question']=clean(text[:marker.start()] if marker else text); current['options']=renewal_options(text[marker.start():] if marker else '')
        current['answer']=normalize_answer(current['answer'])
        records.append(current)
    return reconcile_official_variants(records)

def validate(items, expected_count=379, require_law=True):
    errors=[]
    if len(items)!=expected_count: errors.append(f'count {len(items)} != expected {expected_count}')
    grouped={}
    for q in items:
        key=(q.get('chapter_no'),q.get('section_no')); grouped.setdefault(key,[]).append(q.get('question_no'))
        if q.get('chapter_no') not in (1,2,3) or q.get('section_no') not in range(1,6): errors.append(f'{key}: invalid heading')
        if not q.get('chapter_title') or not q.get('section_title') or not q.get('question'): errors.append(f'{key}: empty text')
        if [x.get('id') for x in q.get('options',[])] != list('ABCD') or any(not x.get('text') for x in q.get('options',[])): errors.append(f'{key}: invalid options')
        if q.get('answer') not in ('A', 'B', 'C', 'D'): errors.append(f'{key}: invalid answer')
        if require_law and not q.get('law_reference'): errors.append(f'{key}: empty law_reference')
        if require_law and re.match(r'^(?:答案\s*[:：]?\s*)?[（(][A-DＡ-Ｄ][）)]', q.get('law_reference', '')): errors.append(f'{key}: answer prefix in law_reference')
        if require_law and '法源或來源依據' in q.get('law_reference', ''): errors.append(f'{key}: table header in law_reference')
        if not require_law and q.get('law_reference'): errors.append(f'{key}: unexpected law_reference')
    if set(grouped)!=set(EXPECTED): errors.append(f'sections {sorted(grouped)} != expected')
    for key,count in EXPECTED.items():
        numbers=grouped.get(key,[])
        if numbers != list(range(1,count+1)): errors.append(f'{key}: non-contiguous or wrong count')
    return errors

def semantic_text(value):
    # PDF text layers split lines and insert layout-only spaces differently. For
    # cross-PDF equivalence, ignore Unicode whitespace only; punctuation and all
    # non-whitespace characters remain exact.
    return re.sub(r'\s+', '', value)
def comparable(q):
    return {**{k:q[k] for k in ('chapter_no','section_no','question_no','answer')}, 'question':semantic_text(q['question']), 'options':[{**o, 'text':semantic_text(o['text'])} for o in q['options']]}
def main():
 p=argparse.ArgumentParser(); p.add_argument('with_law_pdf',type=Path); p.add_argument('without_law_pdf',type=Path); p.add_argument('--with-law',type=Path,default=Path('questions_with_law.rebuilt.json')); p.add_argument('--without-law',type=Path,default=Path('questions_without_law.rebuilt.json')); p.add_argument('--force',action='store_true'); args=p.parse_args()
 if any(refuses_corrected_output(x) for x in (args.with_law,args.without_law)): p.error('refusing corrected output')
 a=parse(args.with_law_pdf,True); b=parse(args.without_law_pdf,False)
 errors=validate(a)+validate(b,require_law=False)
 if [comparable(x) for x in a] != [comparable(x) for x in b]: errors.append('independent PDFs have semantic differences')
 if errors:
  print('\n'.join(errors[:100]),file=sys.stderr); return 1
 write_output_pair(args.with_law,args.without_law,json.dumps(a,ensure_ascii=False,indent=2)+'\n',json.dumps(b,ensure_ascii=False,indent=2)+'\n',overwrite=args.force)
 print('OK: 379 independently cross-checked questions'); return 0
if __name__=='__main__': sys.exit(main())
