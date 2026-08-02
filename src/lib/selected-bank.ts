import type { BankKey } from './session'

export function readSelectedBank(storageKey: string): BankKey | null {
  try {
    const persistentValue = localStorage.getItem(storageKey)
    if (persistentValue === 'withLaw' || persistentValue === 'withoutLaw') return persistentValue
  } catch { /* restricted storage */ }

  try {
    const sessionValue = sessionStorage.getItem(storageKey)
    if (sessionValue !== 'withLaw' && sessionValue !== 'withoutLaw') return null
    try { localStorage.setItem(storageKey, sessionValue) } catch { /* continue this session */ }
    return sessionValue
  } catch { return null }
}

export function storeSelectedBank(storageKey: string, bankKey: BankKey): void {
  try {
    localStorage.setItem(storageKey, bankKey)
  } catch {
    try { sessionStorage.setItem(storageKey, bankKey) } catch { /* restricted storage */ }
  }
}
