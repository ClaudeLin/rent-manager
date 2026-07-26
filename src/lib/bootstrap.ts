import { initRentApp } from './app'
import { validateQuestionAnnotations } from './question-annotations'
import { validateQuestionBank } from './questions'

export type ExamView = 'practice' | 'chapter' | 'mock' | 'wrong'

const BANK_KEY = 'rent-exam-question-bank-v1'
const readSelectedBank = (): string | null => {
  try {
    const persistentValue = localStorage.getItem(BANK_KEY)

    if (persistentValue) {
      return persistentValue
    }
  } catch {
    // localStorage 在部分受限制環境可能不可用。
  }

  try {
    const sessionValue = sessionStorage.getItem(BANK_KEY)

    if (sessionValue) {
      // 將舊版 sessionStorage 設定遷移至 localStorage。
      try {
        localStorage.setItem(BANK_KEY, sessionValue)
      } catch {
        // 無法持久化時仍可繼續使用目前 session。
      }
    }

    return sessionValue
  } catch {
    return null
  }
}
const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!)

export async function bootstrapExamPage(root: HTMLElement, initialView: ExamView): Promise<void> {
  const routes = {
    home: '/',
    practice: '/practice/',
    chapter: '/practice/chapter/',
    mock: '/mock/',
    wrong: '/wrong/',
    about: '/about/',
  }
  const questionBanks = {
    withLaw: { label: '有詳解題庫', path: '/data/questions_with_law.json' },
    withoutLaw: { label: '只有答案題庫', path: '/data/questions_without_law.json' },
  } as const

  const bankKey = readSelectedBank() as | keyof typeof questionBanks | null
  if (!bankKey || !(bankKey in questionBanks)) {
    window.location.replace(routes.home)
    return
  }

  const bank = questionBanks[bankKey]
  root.innerHTML = `<p class="loading">正在載入${bank.label}…</p>`
  try {
    const [bankResponse, annotationsResponse] = await Promise.all([
      fetch(bank.path),
      fetch('/data/question_annotations.json'),
    ])
    if (!bankResponse.ok) throw new Error(`題庫讀取失敗（${bankResponse.status}）`)
    if (!annotationsResponse.ok) throw new Error(`題目註記讀取失敗（${annotationsResponse.status}）`)
    const questions = validateQuestionBank(await bankResponse.json())
    const annotations = validateQuestionAnnotations(await annotationsResponse.json(), questions)
    initRentApp(root, questions, { routes, bankLabel: bank.label, bankKey, initialView, annotations })
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知錯誤'
    root.innerHTML = `<section class="load-error"><p role="alert">${escapeHtml(bank.label)}目前無法載入：${escapeHtml(message)}</p><a class="button" href="${routes.home}">返回入口</a></section>`
  }
}
