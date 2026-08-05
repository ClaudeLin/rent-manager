import type { BankKey } from './session'

export type TrackKey = 'init' | 'renew'
export type ExamView = 'practice' | 'chapter' | 'mock' | 'wrong'

export interface ExamProfile {
  key: TrackKey
  label: string
  basePath: '/init' | '/renew'
  questionBanks: Record<BankKey, { label: string; path: string }>
  annotationPath: string
  storage: { selectedBank: string; session: string; history: string }
  mockExam: { enabled: boolean; questionsPerChapter: number; minutes: number }
  source: { title: string; officialUpdatedAt: string; siteUpdatedAt: string }
  theme: { color: string; manifestPath: string }
}

const initProfile: ExamProfile = {
  key: 'init', label: '初訓', basePath: '/init',
  questionBanks: {
    withLaw: { label: '有詳解題庫', path: '/data/questions_with_law.json' },
    withoutLaw: { label: '只有答案題庫', path: '/data/questions_without_law.json' },
  },
  annotationPath: '/data/question_annotations.json',
  storage: { selectedBank: 'rent-exam-question-bank-v1', session: 'rent-exam-session-v1', history: 'rent-exam-history-v1' },
  mockExam: { enabled: true, questionsPerChapter: 10, minutes: 120 },
  source: { title: '租賃住宅管理人員資格訓練題庫', officialUpdatedAt: '2026-02-06', siteUpdatedAt: '2026-07-21' },
  theme: { color: '#143b63', manifestPath: '/manifest-init.webmanifest' },
}

const renewProfile: ExamProfile = {
  key: 'renew', label: '換證', basePath: '/renew',
  questionBanks: {
    withLaw: { label: '有詳解題庫', path: '/data/renew/questions_with_law.json' },
    withoutLaw: { label: '只有答案題庫', path: '/data/renew/questions_without_law.json' },
  },
  annotationPath: '/data/renew/question_annotations.json',
  storage: { selectedBank: 'rent-exam-renew-question-bank-v1', session: 'rent-exam-renew-session-v1', history: 'rent-exam-renew-history-v1' },
  mockExam: { enabled: false, questionsPerChapter: 10, minutes: 120 },
  source: { title: '租賃住宅管理人員換證訓練題庫', officialUpdatedAt: '2026-02-06', siteUpdatedAt: '2026-08-03' },
  theme: { color: '#174b42', manifestPath: '/manifest-renew.webmanifest' },
}

export const examProfiles: Record<TrackKey, ExamProfile> = { init: initProfile, renew: renewProfile }
export const getExamProfile = (key: TrackKey): ExamProfile => examProfiles[key]
export const routesForProfile = (profile: ExamProfile) => ({
  home: profile.basePath + '/', practice: profile.basePath + '/practice/', chapter: profile.basePath + '/practice/chapter/',
  mock: profile.basePath + '/mock/', wrong: profile.basePath + '/wrong/', about: '/about/',
})
