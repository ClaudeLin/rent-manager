import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { questionKey, validateQuestionBank } from '../../src/lib/questions'

const read = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), 'utf8')
const sectionCounts = new Map([
  ['1-1', 37], ['1-2', 59], ['1-3', 18], ['1-4', 37], ['1-5', 20],
  ['2-1', 60], ['2-2', 36], ['3-1', 46], ['3-2', 44], ['3-3', 22],
])

describe('換證 corrected 題庫完整性', () => {
  const withLawSource = read('source-data/renew/questions_with_law_corrected.json')
  const withoutLawSource = read('source-data/renew/questions_without_law_corrected.json')
  const withLaw = validateQuestionBank(JSON.parse(withLawSource))
  const withoutLaw = validateQuestionBank(JSON.parse(withoutLawSource))

  it('runtime 複本逐 byte 對應 corrected source，且 annotation sidecar 是獨立空資料', () => {
    expect(read('public/data/renew/questions_with_law.json')).toBe(withLawSource)
    expect(read('public/data/renew/questions_without_law.json')).toBe(withoutLawSource)
    expect(existsSync(resolve(process.cwd(), 'public/data/renew/question_annotations.json'))).toBe(true)
    expect(JSON.parse(read('public/data/renew/question_annotations.json'))).toEqual({ schema_version: 1, updated_at: '2026-02-06', annotations: [] })
  })

  it('兩份官方 PDF 的已稽核結果有 379 題、完整章節與連續題號', () => {
    expect(withLaw).toHaveLength(379)
    expect(withoutLaw).toHaveLength(379)
    for (const [section, count] of sectionCounts) {
      const [chapterNo, sectionNo] = section.split('-').map(Number)
      const items = withLaw.filter((question) => question.chapter_no === chapterNo && question.section_no === sectionNo)
      expect(items).toHaveLength(count)
      expect(items.map((question) => question.question_no)).toEqual(Array.from({ length: count }, (_, index) => index + 1))
    }
  })

  it('stable content matches, with-law explanations are clean, and without-law contains none', () => {
    expect(withLaw.every((question) => Boolean(question.law_reference) && !/^(答案\s*[:：]?\s*)?[（(][A-DＡ-Ｄ][）)]/.test(question.law_reference!) && !question.law_reference!.includes('法源或來源依據'))).toBe(true)
    expect(withoutLaw.every((question) => !question.law_reference)).toBe(true)
    const semantic = (value: string) => value.replace(/\s+/gu, '')
    const stable = (question: typeof withLaw[number]) => ({
      key: questionKey(question),
      question: semantic(question.question),
      options: question.options.map((option) => ({ ...option, text: semantic(option.text) })),
      answer: question.answer,
    })
    expect(withoutLaw.map(stable)).toEqual(withLaw.map(stable))
  })
})
