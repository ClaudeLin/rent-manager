import { describe, expect, it } from 'vitest'
import {
  annotateQuestionText,
  ignoredQuestionKeys,
  questionAnnotationMap,
  validateQuestionAnnotations,
} from '../../src/lib/question-annotations'
import type { Question } from '../../src/lib/questions'

const questions: Question[] = [
  {
    chapter_no: 2,
    chapter_code: '貳',
    chapter_title: '不動產租賃及租稅相關法規(新修訂)',
    section_no: 1,
    section_code: '一',
    section_title: '民法有關房屋租用之相關規定',
    question_no: 5,
    question: '第五題原文',
    options: [{ id: 'A', text: '甲' }, { id: 'B', text: '乙' }],
    answer: 'A',
  },
  {
    chapter_no: 2,
    chapter_code: '貳',
    chapter_title: '不動產租賃及租稅相關法規(新修訂)',
    section_no: 1,
    section_code: '一',
    section_title: '民法有關房屋租用之相關規定',
    question_no: 17,
    question: '除言明每月租金多寡外，並為約定租金應如何支付。',
    options: [{ id: 'A', text: '甲' }, { id: 'B', text: '乙' }],
    answer: 'A',
  },
]

const rawAnnotations = {
  schema_version: 1,
  updated_at: '2026-07-23',
  annotations: [
    {
      question_key: 'c2-s1-q5',
      type: 'ignore',
      message: '依實際課程資訊，此題可忽略。',
    },
    {
      question_key: 'c2-s1-q17',
      type: 'typo',
      message: '題目原文疑有錯字，考試仍可能沿用原文；括號為補充字詞。',
      question_replacement: {
        from: '並為約定',
        to: '並為（未）約定',
      },
    },
  ],
}

describe('題目註記 metadata', () => {
  it('驗證共用註記、取得模擬考排除 key，並只在顯示時補上錯字提示', () => {
    const document = validateQuestionAnnotations(rawAnnotations, questions)
    const byKey = questionAnnotationMap(document)

    expect([...ignoredQuestionKeys(document)]).toEqual(['c2-s1-q5'])
    expect(annotateQuestionText(questions[0], byKey.get('c2-s1-q5'))).toBe('第五題原文')
    expect(annotateQuestionText(questions[1], byKey.get('c2-s1-q17')))
      .toContain('並為（未）約定')
    expect(questions[1].question).toContain('並為約定')
  })

  it('拒絕重複題目 key，避免註記互相覆蓋', () => {
    expect(() => validateQuestionAnnotations({
      ...rawAnnotations,
      annotations: [rawAnnotations.annotations[0], rawAnnotations.annotations[0]],
    }, questions)).toThrow('duplicate')
  })

  it('拒絕無效日期與無法安全套用的錯字替換', () => {
    expect(() => validateQuestionAnnotations({ ...rawAnnotations, updated_at: '2026/07/23' }, questions)).toThrow('updated_at')
    expect(() => validateQuestionAnnotations({ ...rawAnnotations, updated_at: '2026-99-99' }, questions)).toThrow('updated_at')
    expect(() => validateQuestionAnnotations({ ...rawAnnotations, unexpected: true }, questions)).toThrow('unknown field')
    expect(() => validateQuestionAnnotations({
      ...rawAnnotations,
      annotations: [{ ...rawAnnotations.annotations[0], unexpected: true }],
    }, questions)).toThrow('unknown field')
    expect(() => validateQuestionAnnotations(rawAnnotations, [
      questions[0],
      { ...questions[1], question: '並為約定，而且再次寫成並為約定。' },
    ])).toThrow('replacement')
    expect(() => validateQuestionAnnotations({
      ...rawAnnotations,
      annotations: [
        rawAnnotations.annotations[0],
        {
          ...rawAnnotations.annotations[1],
          question_replacement: { from: '並為約定', to: '並為約定' },
        },
      ],
    }, questions)).toThrow('replacement')
  })
})
