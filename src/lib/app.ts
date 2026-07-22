import { buildMockExam, questionKey, selectQuestions, type Question } from './questions'
import { formatRemaining, remainingSeconds, shouldAutoSubmit } from './timer'

type Mode = 'practice' | 'mock' | 'result' | 'review'
type History = { answered: number; correct: number; wrongKeys: string[] }

const HISTORY_KEY = 'rent-exam-history-v1'
const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!)
const button = (action: string, label: string, extra = '') => `<button type="button" class="button" data-action="${action}" ${extra}>${label}</button>`

function readHistory(): History {
  try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '{}') as Partial<History>
    const answered = Number.isInteger(saved.answered) && Number(saved.answered) >= 0 ? Number(saved.answered) : 0
    const savedCorrect = Number.isInteger(saved.correct) && Number(saved.correct) >= 0 ? Number(saved.correct) : 0
    const correct = Math.min(savedCorrect, answered)
    const wrongKeys = Array.isArray(saved.wrongKeys)
      ? [...new Set(saved.wrongKeys.filter((key): key is string => typeof key === 'string' && /^c[1-9]\d*-s[1-9]\d*-q[1-9]\d*$/.test(key)))]
      : []
    return { answered, correct, wrongKeys }
  } catch { return { answered: 0, correct: 0, wrongKeys: [] } }
}

function writeHistory(history: History): void {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)) } catch { /* Storage may be unavailable in restricted contexts. */ }
}

export function initRentApp(root: HTMLElement, questions: Question[]): void {
  let mode: Mode = 'practice'
  let practiceQuestions = selectQuestions(questions, { count: questions.length })
  let practiceIndex = 0
  let selectedAnswer: string | undefined
  let checked = false
  let explanationOpen = false
  let practiceLabel = '全題庫隨機練習'
  let chapterNo = ''
  let examQuestions: Question[] = []
  let examAnswers: Record<string, string> = {}
  let examIndex = 0
  let examStartedAt = 0
  let timerId: ReturnType<typeof setInterval> | undefined
  let resultExplanations = new Set<string>()
  const unavailableChapter = Array.from({ length: 10 }, (_, index) => index + 1)
    .find((chapter) => questions.filter((question) => question.chapter_no === chapter).length < 10)
  let mockError = unavailableChapter ? `第 ${unavailableChapter} 章題數不足，至少需要 10 題，無法建立模擬考。` : ''
  let confirmingSubmit = false
  let examRecorded = false

  const currentPractice = () => practiceQuestions[practiceIndex]
  const savePractice = () => {
    const history = readHistory()
    const current = currentPractice()
    const isCorrect = selectedAnswer === current.answer
    const wrongKeys = new Set(history.wrongKeys)
    if (isCorrect) wrongKeys.delete(questionKey(current)); else wrongKeys.add(questionKey(current))
    writeHistory({ answered: history.answered + 1, correct: history.correct + Number(isCorrect), wrongKeys: [...wrongKeys] })
  }
  const saveExam = () => {
    if (examRecorded) return
    const history = readHistory()
    const wrongKeys = new Set(history.wrongKeys)
    let answered = 0
    let correct = 0
    for (const question of examQuestions) {
      const key = questionKey(question)
      const answer = examAnswers[key]
      if (!answer) continue
      answered += 1
      if (answer === question.answer) { correct += 1; wrongKeys.delete(key) } else wrongKeys.add(key)
    }
    writeHistory({ answered: history.answered + answered, correct: history.correct + correct, wrongKeys: [...wrongKeys] })
    examRecorded = true
  }
  const stopTimer = () => { if (timerId !== undefined) clearInterval(timerId); timerId = undefined }
  const renderHeader = () => `<header class="brand"><p>🏠 租賃住宅管理人員</p><strong>Rental Housing Manager</strong><small>Practice • Mock Exam • Review</small></header>`
  const renderOptions = (question: Question, answer?: string, reveal = false) => `<div class="options">${question.options.map((option) => {
    const selected = answer === option.id
    const correctness = reveal ? (option.id === question.answer ? ' is-correct' : selected ? ' is-wrong' : '') : selected ? ' is-selected' : ''
    return `<button type="button" class="option${correctness}" data-option="${escapeHtml(option.id)}" aria-pressed="${selected}"><b>${escapeHtml(option.id)}</b><span>${escapeHtml(option.text)}</span></button>`
  }).join('')}</div>`
  const renderExplanation = (question: Question, action = 'toggle-explanation', open = explanationOpen) => question.law_reference ? `${button(action, open ? '收合詳解' : '查看詳解')} ${open ? `<aside class="explanation">${escapeHtml(question.law_reference)}</aside>` : ''}` : ''
  const renderPractice = () => {
    const current = currentPractice()
    if (!current) {
      root.innerHTML = `${renderHeader()}<section class="card"><h1>${practiceLabel}</h1><p>此題組已完成。請重新選擇練習方式。</p>${button('start-all-practice', '重新開始全題庫練習')}</section>`
      bind()
      return
    }
    root.innerHTML = `${renderHeader()}<main class="app-shell"><aside class="control-panel"><h2>練習設定</h2>${button('start-all-practice', '全題庫隨機練習')}<label>選擇章節<select data-action="chapter-select"><option value="">請選擇章節</option>${[...new Map(questions.map((q) => [q.chapter_no, q.chapter_title])).entries()].map(([number, title]) => `<option value="${number}" ${String(number) === chapterNo ? 'selected' : ''}>第 ${number} 章・${escapeHtml(title)}</option>`).join('')}</select></label>${button('start-chapter-practice', '開始章節練習', chapterNo ? '' : 'disabled')} ${button('start-mock', '開始 120 分鐘模擬考', mockError ? 'disabled' : '')} ${button('show-review', 'Review')}${mockError ? `<p class="feedback error" role="alert">${escapeHtml(mockError)}</p>` : ''}</aside><section class="card question-card" data-question-key="${questionKey(current)}"><p class="eyebrow">${escapeHtml(practiceLabel)}・第 ${practiceIndex + 1} / ${practiceQuestions.length} 題</p><h1>${escapeHtml(current.question)}</h1>${renderOptions(current, selectedAnswer, checked)}${checked ? `<p class="feedback ${selectedAnswer === current.answer ? 'success' : 'error'}">${selectedAnswer === current.answer ? '答對了！' : '答錯了。'} 正確答案：${escapeHtml(current.answer)}</p>${renderExplanation(current)}${button('next-practice', practiceIndex + 1 < practiceQuestions.length ? '下一題' : '完成本輪')}</p>` : button('check-practice', '檢查答案', selectedAnswer ? '' : 'disabled')}</section></main>`
    bind()
  }
  const renderMock = () => {
    const current = examQuestions[examIndex]
    const unanswered = examQuestions.filter((question) => !examAnswers[questionKey(question)]).length
    root.innerHTML = `${renderHeader()}<main class="app-shell"><aside class="control-panel"><h2>模擬考</h2><p class="timer" data-timer>${formatRemaining(remainingSeconds(examStartedAt, Date.now()))}</p><p>已答 ${examQuestions.length - unanswered} / 100</p>${button('submit-mock', '交卷')}${confirmingSubmit ? `<div class="confirm" role="alert"><p>尚有 ${unanswered} 題未作答</p>${button('confirm-submit-mock', '確認交卷')}${button('cancel-submit-mock', '繼續作答')}</div>` : ''}</aside><section class="card question-card" data-question-key="${questionKey(current)}"><p class="eyebrow">第 ${examIndex + 1} / 100 題・第 ${current.chapter_no} 章</p><h1>${escapeHtml(current.question)}</h1>${renderOptions(current, examAnswers[questionKey(current)])}<nav class="pager">${button('mock-prev', '上一題', examIndex ? '' : 'disabled')}${button('mock-next', '下一題', examIndex < 99 ? '' : 'disabled')}</nav><div class="exam-map" aria-label="試題導覽">${examQuestions.map((question, index) => `<button type="button" data-exam-index="${index}" class="${examAnswers[questionKey(question)] ? 'answered' : ''}" aria-label="第 ${index + 1} 題">${index + 1}</button>`).join('')}</div></section></main>`
    bind()
  }
  const renderResult = () => {
    const correct = examQuestions.filter((question) => examAnswers[questionKey(question)] === question.answer).length
    const byChapter = Array.from({ length: 10 }, (_, index) => index + 1).map((chapter) => ({ chapter, total: examQuestions.filter((q) => q.chapter_no === chapter), correct: examQuestions.filter((q) => q.chapter_no === chapter && examAnswers[questionKey(q)] === q.answer).length }))
    root.innerHTML = `${renderHeader()}<main class="app-shell"><section class="card results"><h1>模擬考成績</h1><p class="score">${correct} / 100 題（${correct}%）</p><h2>章節統計</h2><ul>${byChapter.map(({ chapter, total, correct: chapterCorrect }) => `<li>第 ${chapter} 章：${chapterCorrect} / ${total.length} 題正確</li>`).join('')}</ul><h2>逐題答案</h2>${examQuestions.map((question, index) => { const key = questionKey(question); const open = resultExplanations.has(key); return `<article class="result-item" data-question-key="${key}"><p>第 ${index + 1} 題・你的答案：${escapeHtml(examAnswers[key] ?? '未作答')}；正確答案：${escapeHtml(question.answer)}・${examAnswers[key] === question.answer ? '✓ 正確' : '✗ 錯誤'}</p><h3>${escapeHtml(question.question)}</h3>${renderExplanation(question, 'toggle-result-explanation', open)}</article>` }).join('')}</section></main>`
    bind()
  }
  const renderReview = () => {
    const history = readHistory()
    const rate = history.answered ? Math.round(history.correct / history.answered * 100) : 0
    root.innerHTML = `${renderHeader()}<main class="app-shell"><section class="card"><h1>Review</h1><p>作答紀錄僅保存在此瀏覽器。</p><dl><dt>累計作答</dt><dd>累計作答：${history.answered}</dd><dt>正確率</dt><dd>${rate}%</dd><dt>錯題</dt><dd>錯題數：${history.wrongKeys.length}</dd></dl>${button('practice-wrongs', '只練錯題', history.wrongKeys.length ? '' : 'disabled')} ${button('reset-history', '重設本機紀錄')} ${button('start-all-practice', '返回練習')}</section></main>`
    bind()
  }
  const render = () => { if (mode === 'mock') renderMock(); else if (mode === 'result') renderResult(); else if (mode === 'review') renderReview(); else renderPractice() }
  const submitExam = () => {
    if (mode !== 'mock') return
    stopTimer()
    saveExam()
    confirmingSubmit = false
    mode = 'result'
    render()
  }
  const bind = () => {
    root.querySelectorAll<HTMLButtonElement>('[data-option]').forEach((element) => element.addEventListener('click', () => {
      if (mode === 'result' || (mode === 'practice' && checked)) return
      if (mode === 'mock') {
        examAnswers[questionKey(examQuestions[examIndex])] = element.dataset.option!
        render()
        return
      }
      selectedAnswer = element.dataset.option
      root.querySelectorAll<HTMLElement>('[data-option]').forEach((option) => {
        const isSelected = option === element
        option.classList.toggle('is-selected', isSelected)
        option.setAttribute('aria-pressed', String(isSelected))
      })
      const checkButton = root.querySelector<HTMLButtonElement>('[data-action="check-practice"]')
      if (checkButton) checkButton.disabled = false
    }))
    root.querySelector<HTMLSelectElement>('[data-action="chapter-select"]')?.addEventListener('change', (event) => { chapterNo = (event.target as HTMLSelectElement).value; render() })
    root.querySelectorAll<HTMLButtonElement>('[data-exam-index]').forEach((element) => element.addEventListener('click', () => {
      examIndex = Number(element.dataset.examIndex)
      confirmingSubmit = false
      render()
    }))
    root.querySelectorAll<HTMLElement>('[data-action]').forEach((element) => element.addEventListener('click', () => {
      const action = element.dataset.action
      if (action === 'start-all-practice') { stopTimer(); mode = 'practice'; practiceLabel = '全題庫隨機練習'; practiceQuestions = selectQuestions(questions, { count: questions.length }); practiceIndex = 0; selectedAnswer = undefined; checked = false; explanationOpen = false; render() }
      if (action === 'start-chapter-practice' && chapterNo) { practiceLabel = `第 ${chapterNo} 章隨機練習`; practiceQuestions = selectQuestions(questions, { chapterNo: Number(chapterNo), count: questions.length }); practiceIndex = 0; selectedAnswer = undefined; checked = false; explanationOpen = false; render() }
      if (action === 'check-practice' && selectedAnswer) { checked = true; savePractice(); render() }
      if (action === 'next-practice' && checked) { practiceIndex += 1; selectedAnswer = undefined; checked = false; explanationOpen = false; render() }
      if (action === 'toggle-explanation') { explanationOpen = !explanationOpen; render() }
      if (action === 'start-mock') {
        try {
          examQuestions = buildMockExam(questions)
          examAnswers = {}
          examIndex = 0
          examStartedAt = Date.now()
          examRecorded = false
          confirmingSubmit = false
          resultExplanations.clear()
          mockError = ''
          mode = 'mock'
          stopTimer()
          timerId = setInterval(() => {
            if (shouldAutoSubmit(remainingSeconds(examStartedAt, Date.now()))) submitExam()
            else {
              const timer = root.querySelector('[data-timer]')
              if (timer) timer.textContent = formatRemaining(remainingSeconds(examStartedAt, Date.now()))
            }
          }, 1000)
          render()
        } catch (error) {
          mockError = error instanceof Error ? error.message : '題庫資料不足，無法建立模擬考。'
          mode = 'practice'
          render()
        }
      }
      if (action === 'mock-prev') { examIndex = Math.max(0, examIndex - 1); render() }
      if (action === 'mock-next') { examIndex = Math.min(99, examIndex + 1); render() }
      if (action === 'submit-mock') {
        const unanswered = examQuestions.filter((question) => !examAnswers[questionKey(question)]).length
        if (unanswered) { confirmingSubmit = true; render() } else submitExam()
      }
      if (action === 'cancel-submit-mock') { confirmingSubmit = false; render() }
      if (action === 'confirm-submit-mock') submitExam()
      if (action === 'toggle-result-explanation') {
        const key = element.closest<HTMLElement>('.result-item')?.dataset.questionKey
        if (!key) return
        if (resultExplanations.has(key)) resultExplanations.delete(key); else resultExplanations.add(key)
        render()
      }
      if (action === 'show-review') { stopTimer(); mode = 'review'; render() }
      if (action === 'practice-wrongs') { const wrong = readHistory().wrongKeys; practiceLabel = '錯題練習'; practiceQuestions = selectQuestions(questions, { count: questions.length, wrongKeys: wrong }).filter((question) => wrong.includes(questionKey(question))); practiceIndex = 0; selectedAnswer = undefined; checked = false; mode = 'practice'; render() }
      if (action === 'reset-history') { try { localStorage.removeItem(HISTORY_KEY) } catch { /* Storage may be unavailable. */ }; render() }
    }))
  }
  render()
}
