import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { questionKey, validateQuestionBank } from '../../src/lib/questions'
import { ignoredQuestionKeys, questionAnnotationMap, validateQuestionAnnotations } from '../../src/lib/question-annotations'

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

  it('共用註記只標記指定三題，且同時符合兩種題庫', () => {
    const annotationPath = resolve(process.cwd(), 'public/data/question_annotations.json')
    expect(existsSync(annotationPath)).toBe(true)

    const raw = JSON.parse(readFileSync(annotationPath, 'utf8'))
    const withLaw = validateQuestionBank(JSON.parse(banks.withLawSource))
    const withoutLaw = validateQuestionBank(JSON.parse(banks.withoutLawSource))
    const withLawAnnotations = validateQuestionAnnotations(raw, withLaw)
    const withoutLawAnnotations = validateQuestionAnnotations(raw, withoutLaw)

    expect(withoutLawAnnotations).toEqual(withLawAnnotations)
    expect(withLawAnnotations.annotations.map((annotation) => annotation.question_key)).toEqual([
      'c2-s1-q5',
      'c2-s1-q17',
      'c2-s1-q23',
    ])
    expect([...ignoredQuestionKeys(withLawAnnotations)]).toEqual(['c2-s1-q5', 'c2-s1-q23'])
    expect(questionAnnotationMap(withLawAnnotations).get('c2-s1-q17')).toMatchObject({
      type: 'typo',
      question_replacement: { from: '並為約定', to: '並為（未）約定' },
    })
  })
})
