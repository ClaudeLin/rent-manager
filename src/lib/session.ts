import { questionKey, type Question } from './questions'

export const PRACTICE_SESSION_KEY = 'rent-exam-session-v1'

export type BankKey = 'withLaw' | 'withoutLaw'
export type SessionView = 'practice' | 'chapter' | 'wrong' | 'mock'
export type ChapterOrder = 'random' | 'sequential'

interface StoredSessionBase {
  version: 1
  bankKey: BankKey
  bankSignature: string
  questionKeys: string[]
  index: number
  updatedAt: number
}

export interface StoredPracticeSession extends StoredSessionBase {
  kind: 'practice'
  view: Exclude<SessionView, 'mock'>
  selectedAnswer: string | null
  checked: boolean
  explanationOpen: boolean
  chapterNo: number | null
  chapterOrder: ChapterOrder
  settingsCollapsed: boolean
}

export interface StoredMockSession extends StoredSessionBase {
  kind: 'mock'
  view: 'mock'
  answers: Record<string, string>
  attemptId: string
  startedAt: number
}

export type StoredSession = StoredPracticeSession | StoredMockSession
export type HydratedSession =
  | (StoredPracticeSession & { questions: Question[] })
  | (StoredMockSession & { questions: Question[] })

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isBankKey = (value: unknown): value is BankKey => value === 'withLaw' || value === 'withoutLaw'
const isQuestionKey = (value: unknown): value is string => typeof value === 'string' && /^c[1-9]\d*-s[1-9]\d*-q[1-9]\d*$/.test(value)
const isAnswer = (value: unknown): value is string => typeof value === 'string' && /^[A-D]$/.test(value)
const isAttemptId = (value: unknown): value is string => typeof value === 'string' && /^attempt-[A-Za-z0-9_-]{8,80}$/.test(value)
const isSafeInteger = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0

export function questionBankSignature(questions: Question[]): string {
  const content = [...questions]
    .sort((left, right) => questionKey(left).localeCompare(questionKey(right)))
    .map((question) => [
      questionKey(question),
      question.question,
      question.answer,
      ...question.options.flatMap((option) => [option.id, option.text]),
      question.law_reference ?? '',
    ].join('\u001f'))
    .join('\u001e')

  let hash = 0x811c9dc5
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `${questions.length}-${hash.toString(16).padStart(8, '0')}`
}

export function parseStoredSession(value: unknown): StoredSession | null {
  if (!isRecord(value) || value.version !== 1 || !isBankKey(value.bankKey)) return null
  if (typeof value.bankSignature !== 'string' || !value.bankSignature) return null
  if (!Array.isArray(value.questionKeys) || value.questionKeys.length === 0 || value.questionKeys.length > 2_000) return null
  if (!value.questionKeys.every(isQuestionKey) || new Set(value.questionKeys).size !== value.questionKeys.length) return null
  if (!isSafeInteger(value.index) || value.index >= value.questionKeys.length || !isSafeInteger(value.updatedAt)) return null

  const questionKeys = value.questionKeys as string[]
  const base = {
    version: 1 as const,
    bankKey: value.bankKey,
    bankSignature: value.bankSignature,
    questionKeys: [...questionKeys],
    index: value.index,
    updatedAt: value.updatedAt,
  }

  if (value.kind === 'practice') {
    if (value.view !== 'practice' && value.view !== 'chapter' && value.view !== 'wrong') return null
    if (value.selectedAnswer !== null && !isAnswer(value.selectedAnswer)) return null
    if (typeof value.checked !== 'boolean' || typeof value.explanationOpen !== 'boolean' || typeof value.settingsCollapsed !== 'boolean') return null
    if (value.checked && value.selectedAnswer === null) return null
    if (value.explanationOpen && !value.checked) return null
    if (value.chapterOrder !== 'random' && value.chapterOrder !== 'sequential') return null
    if (value.chapterNo !== null && (!Number.isInteger(value.chapterNo) || Number(value.chapterNo) < 1 || Number(value.chapterNo) > 10)) return null
    if (value.view === 'chapter' && value.chapterNo === null) return null

    return {
      ...base,
      kind: 'practice',
      view: value.view,
      selectedAnswer: value.selectedAnswer,
      checked: value.checked,
      explanationOpen: value.explanationOpen,
      chapterNo: value.chapterNo as number | null,
      chapterOrder: value.chapterOrder,
      settingsCollapsed: value.settingsCollapsed,
    }
  }

  if (value.kind === 'mock') {
    if (value.view !== 'mock' || base.questionKeys.length !== 100 || !isAttemptId(value.attemptId) || !isSafeInteger(value.startedAt) || value.startedAt === 0 || !isRecord(value.answers)) return null
    const entries = Object.entries(value.answers)
    if (entries.some(([key, answer]) => !base.questionKeys.includes(key) || !isAnswer(answer))) return null
    return { ...base, kind: 'mock', view: 'mock', answers: Object.fromEntries(entries) as Record<string, string>, attemptId: value.attemptId, startedAt: value.startedAt }
  }

  return null
}

export function hydrateStoredSession(
  value: unknown,
  questions: Question[],
  bankKey: BankKey,
  expectedView: SessionView,
): HydratedSession | null {
  const stored = parseStoredSession(value)
  if (!stored || stored.bankKey !== bankKey || stored.view !== expectedView) return null
  if (stored.bankSignature !== questionBankSignature(questions)) return null
  if (stored.kind === 'mock' && stored.startedAt > Date.now()) return null

  const byKey = new Map(questions.map((question) => [questionKey(question), question]))
  const restoredQuestions = stored.questionKeys.map((key) => byKey.get(key))
  if (restoredQuestions.some((question) => !question)) return null
  const hydratedQuestions = restoredQuestions as Question[]

  if (stored.kind === 'practice') {
    const current = hydratedQuestions[stored.index]
    if (stored.selectedAnswer !== null && !current.options.some((option) => option.id === stored.selectedAnswer)) return null
    return { ...stored, questions: hydratedQuestions }
  }

  for (const [key, answer] of Object.entries(stored.answers)) {
    const question = byKey.get(key)
    if (!question || !question.options.some((option) => option.id === answer)) return null
  }
  const chapterCounts = Array.from({ length: 10 }, (_, index) => index + 1)
    .map((chapter) => hydratedQuestions.filter((question) => question.chapter_no === chapter).length)
  if (chapterCounts.some((count) => count !== 10)) return null
  return { ...stored, questions: hydratedQuestions }
}

export function readStoredSession(): StoredSession | null {
  try {
    return parseStoredSession(JSON.parse(localStorage.getItem(PRACTICE_SESSION_KEY) ?? 'null'))
  } catch {
    return null
  }
}

export function writeStoredSession(session: StoredSession): void {
  try {
    localStorage.setItem(PRACTICE_SESSION_KEY, JSON.stringify(session))
  } catch {
    // Storage may be unavailable in restricted contexts.
  }
}

export function clearStoredSession(): void {
  try {
    localStorage.removeItem(PRACTICE_SESSION_KEY)
  } catch {
    // Storage may be unavailable in restricted contexts.
  }
}

export function sessionSummary(session: StoredSession): { bankKey: BankKey; route: string; title: string; progress: string } {
  const route = session.view === 'chapter' ? '/practice/chapter/' : session.view === 'wrong' ? '/wrong/' : session.view === 'mock' ? '/mock/' : '/practice/'
  const title = session.kind === 'mock'
    ? '120 分鐘模擬考'
    : session.view === 'chapter'
      ? `第 ${session.chapterNo} 章${session.chapterOrder === 'sequential' ? '依題號順序' : '隨機'}練習`
      : session.view === 'wrong'
        ? '錯題練習'
        : '全題庫隨機練習'
  return { bankKey: session.bankKey, route, title, progress: `第 ${session.index + 1} / ${session.questionKeys.length} 題` }
}
