import { describe, expect, it } from 'vitest'
import {
  buildMockExam,
  filterQuestions,
  questionKey,
  selectQuestions,
  validateQuestionBank,
  type Question,
} from '../../src/lib/questions'

const questions: Question[] = [
  {
    chapter_no: 1, chapter_code: '壹', chapter_title: '第一章',
    section_no: 1, section_code: '一', section_title: '第一節', question_no: 1,
    question: '題目一', options: [{ id: 'A', text: '甲' }, { id: 'B', text: '乙' }], answer: 'A', law_reference: '法源一',
  },
  {
    chapter_no: 1, chapter_code: '壹', chapter_title: '第一章',
    section_no: 2, section_code: '二', section_title: '第二節', question_no: 1,
    question: '題目二', options: [{ id: 'A', text: '甲' }, { id: 'B', text: '乙' }], answer: 'B',
  },
  {
    chapter_no: 2, chapter_code: '貳', chapter_title: '第二章',
    section_no: 1, section_code: '一', section_title: '第一節', question_no: 1,
    question: '題目三', options: [{ id: 'A', text: '甲' }, { id: 'B', text: '乙' }], answer: 'A',
  },
]

describe('題庫 domain', () => {
  it('接受有效題庫並拒絕答案不在選項中的題目', () => {
    expect(validateQuestionBank(questions)).toEqual(questions)
    expect(() => validateQuestionBank([{ ...questions[0], answer: 'Z' }])).toThrow('answer')
  })

  it('拒絕可能注入 HTML 的選項 ID 與重複 ID', () => {
    expect(() => validateQuestionBank([{ ...questions[0], options: [
      { id: 'A', text: '甲' },
      { id: '\"><img src=x onerror=alert(1)>', text: '惡意' },
    ], answer: 'A' }])).toThrow('options')
    expect(() => validateQuestionBank([{ ...questions[0], options: [
      { id: 'A', text: '甲' },
      { id: 'A', text: '重複' },
    ] }])).toThrow('options')
  })

  it('產生跨章節仍穩定且唯一的題目 key', () => {
    expect(questionKey(questions[0])).toBe('c1-s1-q1')
    expect(new Set(questions.map(questionKey)).size).toBe(3)
  })

  it('可依章節或指定小節篩選', () => {
    expect(filterQuestions(questions, { chapterNo: 1 })).toHaveLength(2)
    expect(filterQuestions(questions, { chapterNo: 1, sectionNo: 2 }).map(questionKey)).toEqual(['c1-s2-q1'])
  })

  it('以指定 RNG 無重複且可重現地抽題', () => {
    const rng = () => 0.75
    const first = selectQuestions(questions, { count: 2, rng }).map(questionKey)
    const second = selectQuestions(questions, { count: 2, rng }).map(questionKey)
    expect(first).toEqual(second)
    expect(new Set(first).size).toBe(2)
  })

  it('把題數限制在候選題數之內並支援錯題優先', () => {
    expect(selectQuestions(questions, { count: 99, rng: () => 0 })).toHaveLength(3)
    expect(selectQuestions(questions, { count: 2, wrongKeys: ['c2-s1-q1'], rng: () => 0 }).map(questionKey)[0]).toBe('c2-s1-q1')
  })

  it('模擬考從每章各抽十題，總共一百題且題目不重複', () => {
    const bank = Array.from({ length: 10 }, (_, chapterIndex) =>
      Array.from({ length: 10 }, (_, questionIndex) => ({
        ...questions[0], chapter_no: chapterIndex + 1, section_no: 1, question_no: questionIndex + 1,
      })),
    ).flat()
    const exam = buildMockExam(bank, () => 0.5)
    expect(exam).toHaveLength(100)
    expect(new Set(exam.map(questionKey)).size).toBe(100)
    expect(Array.from({ length: 10 }, (_, index) => exam.filter((question) => question.chapter_no === index + 1).length)).toEqual(Array(10).fill(10))
  })

  it('模擬考在任一章不足十題時 fail closed', () => {
    const bank = Array.from({ length: 10 }, (_, chapterIndex) =>
      Array.from({ length: chapterIndex === 9 ? 9 : 10 }, (_, questionIndex) => ({
        ...questions[0], chapter_no: chapterIndex + 1, section_no: 1, question_no: questionIndex + 1,
      })),
    ).flat()
    expect(() => buildMockExam(bank)).toThrow('第 10 章')
  })

  it('模擬考使用指定 RNG 時題組與順序可重現', () => {
    const bank = Array.from({ length: 10 }, (_, chapterIndex) =>
      Array.from({ length: 12 }, (_, questionIndex) => ({
        ...questions[0], chapter_no: chapterIndex + 1, section_no: 1, question_no: questionIndex + 1,
      })),
    ).flat()
    expect(buildMockExam(bank, () => 0.75).map(questionKey)).toEqual(buildMockExam(bank, () => 0.75).map(questionKey))
  })
})
