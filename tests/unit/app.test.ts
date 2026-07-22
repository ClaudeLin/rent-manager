import { afterEach, describe, expect, it, vi } from 'vitest'
import { initRentApp } from '../../src/lib/app'
import type { Question } from '../../src/lib/questions'

const testStorage = new Map<string, string>()
const storage: Storage = {
  get length() { return testStorage.size },
  clear: () => testStorage.clear(),
  getItem: (key) => testStorage.get(key) ?? null,
  key: (index) => [...testStorage.keys()][index] ?? null,
  removeItem: (key) => { testStorage.delete(key) },
  setItem: (key, value) => { testStorage.set(key, String(value)) },
}
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })

const question = (chapter = 1, questionNo = 1): Question => ({
  chapter_no: chapter, chapter_code: `第${chapter}章`, chapter_title: `章節${chapter}`,
  section_no: 1, section_code: '一', section_title: '總則', question_no: questionNo,
  question: `第 ${chapter}-${questionNo} 題？`, options: [{ id: 'A', text: '正確' }, { id: 'B', text: '錯誤' }],
  answer: 'A', law_reference: `法源 ${chapter}-${questionNo}`,
})

const oneQuestion = [question()]
const examQuestions = Array.from({ length: 10 }, (_, chapter) =>
  Array.from({ length: 10 }, (_, index) => question(chapter + 1, index + 1)),
).flat()

function mount(questions: Question[] = oneQuestion) {
  document.body.innerHTML = '<main id="app"></main>'
  initRentApp(document.querySelector<HTMLElement>('#app')!, questions)
}

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
  localStorage.clear()
})

describe('租賃題庫操作介面', () => {
  it('選擇答案不重建題目 DOM，避免手機捲動位置跳動', () => {
    mount()
    const questionCard = document.querySelector('[data-question-key]')
    expect(document.querySelector('[data-option="B"]')!.getAttribute('aria-pressed')).toBe('false')
    document.querySelector<HTMLButtonElement>('[data-option="B"]')!.click()

    expect(document.querySelector('[data-question-key]')).toBe(questionCard)
    expect(document.querySelector<HTMLButtonElement>('[data-action="check-practice"]')!.disabled).toBe(false)
    expect(document.querySelector('[data-option="B"]')!.classList.contains('is-selected')).toBe(true)
    expect(document.querySelector('[data-option="A"]')!.getAttribute('aria-pressed')).toBe('false')
    expect(document.querySelector('[data-option="B"]')!.getAttribute('aria-pressed')).toBe('true')
  })

  it('Practice 作答前不洩漏答案，檢查後先隱藏法源，主動展開才顯示並記錄統計', () => {
    mount()
    expect(document.body.textContent).not.toContain('正確答案：A')
    document.querySelector<HTMLButtonElement>('[data-option="B"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="check-practice"]')!.click()
    expect(document.body.textContent).toContain('正確答案：A')
    expect(document.body.textContent).not.toContain('法源 1-1')
    document.querySelector<HTMLButtonElement>('[data-action="toggle-explanation"]')!.click()
    expect(document.body.textContent).toContain('法源 1-1')
    document.querySelector<HTMLButtonElement>('[data-action="toggle-explanation"]')!.click()
    expect(document.body.textContent).not.toContain('法源 1-1')
    expect(JSON.parse(localStorage.getItem('rent-exam-history-v1')!).wrongKeys).toContain('c1-s1-q1')
  })

  it('可選章節開始隨機練習，並在下一題後避免同輪重複', () => {
    mount([question(1, 1), question(1, 2), question(2, 1)])
    const select = document.querySelector<HTMLSelectElement>('[data-action="chapter-select"]')!
    select.value = '1'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    document.querySelector<HTMLButtonElement>('[data-action="start-chapter-practice"]')!.click()
    const first = document.querySelector('[data-question-key]')!.getAttribute('data-question-key')
    document.querySelector<HTMLButtonElement>('[data-option="A"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="check-practice"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="next-practice"]')!.click()
    expect(document.querySelector('[data-question-key]')!.getAttribute('data-question-key')).not.toBe(first)
  })

  it('模擬考鎖定百題、可切題並於交卷後顯示章節統計與收合詳解', () => {
    mount(examQuestions)
    document.querySelector<HTMLButtonElement>('[data-action="start-mock"]')!.click()
    expect(document.querySelectorAll('[data-exam-index]').length).toBe(100)
    expect(document.body.textContent).toContain('第 1 / 100 題')
    document.querySelector<HTMLButtonElement>('[data-action="mock-next"]')!.click()
    expect(document.body.textContent).toContain('第 2 / 100 題')
    document.querySelector<HTMLButtonElement>('[data-exam-index="49"]')!.click()
    expect(document.body.textContent).toContain('第 50 / 100 題')
    document.querySelector<HTMLButtonElement>('[data-action="submit-mock"]')!.click()
    expect(document.body.textContent).toContain('尚有 100 題未作答')
    document.querySelector<HTMLButtonElement>('[data-action="confirm-submit-mock"]')!.click()
    expect(document.body.textContent).toContain('模擬考成績')
    expect(document.body.textContent).toContain('第 1 章')
    expect(document.body.textContent).not.toContain('法源 1-1')
    document.querySelector<HTMLButtonElement>('[data-action="toggle-result-explanation"]')!.click()
    expect(document.body.textContent).toContain('法源')
  })

  it('模擬考重複題目文字仍依唯一 key 展開被點擊題目的詳解', () => {
    const duplicateTextExam = examQuestions.map((item) =>
      item.chapter_no === 1 && item.question_no <= 2 ? { ...item, question: '相同題目文字？' } : item,
    )
    mount(duplicateTextExam)
    document.querySelector<HTMLButtonElement>('[data-action="start-mock"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="submit-mock"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="confirm-submit-mock"]')!.click()

    const duplicates = [...document.querySelectorAll<HTMLElement>('.result-item')]
      .filter((item) => item.querySelector('h3')?.textContent === '相同題目文字？')
    expect(duplicates).toHaveLength(2)
    for (const item of duplicates) {
      const key = item.dataset.questionKey
      expect(key).toMatch(/^c1-s1-q[12]$/)
      item.querySelector<HTMLButtonElement>('[data-action="toggle-result-explanation"]')!.click()
      expect(document.querySelector<HTMLElement>(`.result-item[data-question-key="${key}"]`)!.textContent)
        .toContain(`法源 1-${key!.endsWith('q1') ? '1' : '2'}`)
    }
  })

  it('模擬考章節不足十題時 fail closed 並顯示可理解錯誤', () => {
    const insufficient = [
      ...examQuestions.filter((item) => !(item.chapter_no === 1 && item.question_no === 10)),
      question(2, 11),
    ]
    mount(insufficient)

    expect(() => document.querySelector<HTMLButtonElement>('[data-action="start-mock"]')!.click()).not.toThrow()
    expect(document.body.textContent).toMatch(/第 1 章.*至少.*10 題/)
    expect(document.querySelector('[data-timer]')).toBeNull()
    expect(document.querySelectorAll('[data-exam-index]')).toHaveLength(0)
  })

  it('模擬考交卷會把已作答題目寫入統計與錯題紀錄', () => {
    mount(examQuestions)
    document.querySelector<HTMLButtonElement>('[data-action="start-mock"]')!.click()
    const firstKey = document.querySelector('[data-question-key]')!.getAttribute('data-question-key')
    document.querySelector<HTMLButtonElement>('[data-option="B"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="submit-mock"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="confirm-submit-mock"]')!.click()

    const history = JSON.parse(localStorage.getItem('rent-exam-history-v1')!)
    expect(history.answered).toBe(1)
    expect(history.correct).toBe(0)
    expect(history.wrongKeys).toContain(firstKey)
  })

  it('倒數時間到會自動交卷', () => {
    vi.useFakeTimers()
    mount(examQuestions)
    document.querySelector<HTMLButtonElement>('[data-action="start-mock"]')!.click()
    vi.advanceTimersByTime(120 * 60 * 1000)
    expect(document.body.textContent).toContain('模擬考成績')
  })

  it('Review 顯示本機統計，能只練錯題並重設紀錄', () => {
    localStorage.setItem('rent-exam-history-v1', JSON.stringify({ answered: 3, correct: 2, wrongKeys: ['c1-s1-q1'] }))
    mount()
    document.querySelector<HTMLButtonElement>('[data-action="show-review"]')!.click()
    expect(document.body.textContent).toContain('累計作答：3')
    expect(document.body.textContent).toContain('錯題數：1')
    document.querySelector<HTMLButtonElement>('[data-action="practice-wrongs"]')!.click()
    expect(document.body.textContent).toContain('錯題練習')
    document.querySelector<HTMLButtonElement>('[data-action="show-review"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="reset-history"]')!.click()
    expect(document.body.textContent).toContain('累計作答：0')
  })

  it('Review 將損壞的本機統計正規化並去除無效與重複錯題 key', () => {
    localStorage.setItem('rent-exam-history-v1', JSON.stringify({
      answered: -3,
      correct: 99,
      wrongKeys: ['c1-s1-q1', 'c1-s1-q1', 3, null, '<img>'],
    }))
    mount()
    document.querySelector<HTMLButtonElement>('[data-action="show-review"]')!.click()

    expect(document.body.textContent).toContain('累計作答：0')
    expect(document.body.textContent).toContain('正確率0%')
    expect(document.body.textContent).toContain('錯題數：1')
  })
})
