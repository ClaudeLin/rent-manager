import { initRentApp } from './app'
import { validateQuestionBank } from './questions'

export type ExamView = 'practice' | 'chapter' | 'mock' | 'wrong'

const BANK_KEY = 'rent-exam-question-bank-v1'
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

  const bankKey = sessionStorage.getItem(BANK_KEY) as keyof typeof questionBanks | null
  if (!bankKey || !(bankKey in questionBanks)) {
    window.location.replace(routes.home)
    return
  }

  const bank = questionBanks[bankKey]
  root.innerHTML = `<p class="loading">正在載入${bank.label}…</p>`
  try {
    const response = await fetch(bank.path)
    if (!response.ok) throw new Error(`題庫讀取失敗（${response.status}）`)
    initRentApp(root, validateQuestionBank(await response.json()), { routes, bankLabel: bank.label, initialView })
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知錯誤'
    root.innerHTML = `<section class="load-error"><p role="alert">${escapeHtml(bank.label)}目前無法載入：${escapeHtml(message)}</p><a class="button" href="${routes.home}">返回入口</a></section>`
  }
}
