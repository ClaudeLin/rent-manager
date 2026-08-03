import { initRentApp } from './app'
import { validateQuestionAnnotations } from './question-annotations'
import { validateQuestionBank } from './questions'
import { getExamProfile, routesForProfile, type ExamView, type TrackKey } from './exam-profiles'
import { readSelectedBank } from './selected-bank'

export type { ExamView } from './exam-profiles'

const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!)

export async function bootstrapExamPage(root: HTMLElement, track: TrackKey, initialView: ExamView): Promise<void> {
  const profile = getExamProfile(track)
  const routes = routesForProfile(profile)
  if (initialView === 'mock' && !profile.mockExam.enabled) { window.location.replace(routes.practice); return }
  const bankKey = readSelectedBank(profile.storage.selectedBank)
  if (!bankKey || !(bankKey in profile.questionBanks)) { window.location.replace(routes.home); return }
  const bank = profile.questionBanks[bankKey]
  root.innerHTML = `<p class="loading">正在載入${bank.label}…</p>`
  try {
    const [bankResponse, annotationsResponse] = await Promise.all([fetch(bank.path), fetch(profile.annotationPath)])
    if (!bankResponse.ok) throw new Error(`題庫讀取失敗（${bankResponse.status}）`)
    if (!annotationsResponse.ok) throw new Error(`題目註記讀取失敗（${annotationsResponse.status}）`)
    const questions = validateQuestionBank(await bankResponse.json())
    const annotations = validateQuestionAnnotations(await annotationsResponse.json(), questions)
    initRentApp(root, questions, { profile, routes, bankLabel: `${profile.label}・${bank.label}`, bankKey, initialView, annotations })
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知錯誤'
    root.innerHTML = `<section class="load-error"><p role="alert">${escapeHtml(bank.label)}目前無法載入：${escapeHtml(message)}</p><a class="button" href="${routes.home}">返回入口</a></section>`
  }
}
