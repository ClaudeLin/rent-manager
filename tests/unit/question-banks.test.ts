import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { questionKey, validateQuestionBank } from '../../src/lib/questions'

const read = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), 'utf8')

const banks = {
  withLawSource: read('source-data/questions_with_law_corrected.json'),
  withoutLawSource: read('source-data/questions_without_law_corrected.json'),
  withLawRuntime: read('public/data/questions_with_law.json'),
  withoutLawRuntime: read('public/data/questions_without_law.json'),
}

describe('corrected 題庫來源不變性', () => {
  it('網站 Runtime 題庫與 corrected 原始來源逐 byte 相同', () => {
    expect(banks.withLawRuntime).toBe(banks.withLawSource)
    expect(banks.withoutLawRuntime).toBe(banks.withoutLawSource)
  })

  it('兩種題庫的 key、題目、選項與答案一致，且法源覆蓋符合選定版本', () => {
    const withLaw = validateQuestionBank(JSON.parse(banks.withLawSource))
    const withoutLaw = validateQuestionBank(JSON.parse(banks.withoutLawSource))

    expect(withLaw).toHaveLength(966)
    expect(withoutLaw).toHaveLength(966)
    expect(withLaw.every((question) => Boolean(question.law_reference))).toBe(true)
    expect(withoutLaw.every((question) => !question.law_reference)).toBe(true)

    expect(withoutLaw.map((question) => ({
      key: questionKey(question),
      question: question.question,
      options: question.options,
      answer: question.answer,
    }))).toEqual(withLaw.map((question) => ({
      key: questionKey(question),
      question: question.question,
      options: question.options,
      answer: question.answer,
    })))
  })
})
