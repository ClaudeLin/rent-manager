import { describe, expect, it } from 'vitest'
import { examProfiles, routesForProfile } from '../../src/lib/exam-profiles'
import { clearHistory, emptyHistory, readHistory, writeHistory } from '../../src/lib/history'
import { clearStoredSession, readStoredSession, writeStoredSession } from '../../src/lib/session'

const storage = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key), clear: () => storage.clear(), get length() { return storage.size }, key: () => null,
} })

const session = { version: 1 as const, kind: 'practice' as const, bankKey: 'withLaw' as const, bankSignature: 'bank', view: 'practice' as const, questionKeys: ['c1-s1-q1'], index: 0, selectedAnswer: null, checked: false, explanationOpen: false, chapterNo: null, chapterOrder: 'random' as const, settingsCollapsed: true, updatedAt: 1 }

describe('track profile 與儲存空間隔離', () => {
  it('初訓保留 legacy keys、換證只使用獨立 keys 與 profile routes', () => {
    expect(examProfiles.init.storage).toEqual({ selectedBank: 'rent-exam-question-bank-v1', session: 'rent-exam-session-v1', history: 'rent-exam-history-v1' })
    expect(examProfiles.renew.storage).toEqual({ selectedBank: 'rent-exam-renew-question-bank-v1', session: 'rent-exam-renew-session-v1', history: 'rent-exam-renew-history-v1' })
    expect(routesForProfile(examProfiles.init).practice).toBe('/init/practice/')
    expect(routesForProfile(examProfiles.renew).wrong).toBe('/renew/wrong/')
    expect(examProfiles.renew.mockExam.enabled).toBe(false)
  })

  it('兩個 track 可同時保存 session/history，renew 不會讀取 init legacy key', () => {
    storage.clear()
    writeStoredSession(session, examProfiles.init.storage.session)
    writeStoredSession({ ...session, bankSignature: 'renew' }, examProfiles.renew.storage.session)
    writeHistory({ ...emptyHistory(), answered: 1, wrongKeys: ['c1-s1-q1'] }, examProfiles.init.storage.history)
    writeHistory({ ...emptyHistory(), answered: 2, correct: 2 }, examProfiles.renew.storage.history)
    expect(readStoredSession(examProfiles.init.storage.session)?.bankSignature).toBe('bank')
    expect(readStoredSession(examProfiles.renew.storage.session)?.bankSignature).toBe('renew')
    expect(readHistory(examProfiles.init.storage.history).answered).toBe(1)
    expect(readHistory(examProfiles.renew.storage.history).answered).toBe(2)
    clearHistory(examProfiles.renew.storage.history)
    clearStoredSession(examProfiles.renew.storage.session)
    expect(readHistory(examProfiles.init.storage.history).answered).toBe(1)
    expect(readStoredSession(examProfiles.init.storage.session)).not.toBeNull()
  })
})
