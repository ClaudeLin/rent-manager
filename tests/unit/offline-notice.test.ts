import { afterEach, describe, expect, it, vi } from 'vitest'
import { showOfflineNotice } from '../../src/lib/offline-notice'

function createNotice(): HTMLElement {
  const notice = document.createElement('aside')
  notice.hidden = true
  notice.innerHTML = '<span data-offline-icon></span><span data-offline-message></span><button type="button" data-dismiss-offline>關閉</button>'
  document.body.append(notice)
  return notice
}

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('離線狀態提示', () => {
  it('離線資料準備完成時顯示 Toast，3 秒後自動關閉', () => {
    vi.useFakeTimers()
    const notice = createNotice()

    showOfflineNotice(notice, 'ready', 3_000)

    expect(notice.hidden).toBe(false)
    expect(notice.dataset.state).toBe('ready')
    expect(notice.classList.contains('is-visible')).toBe(true)
    expect(notice.style.getPropertyValue('--offline-toast-duration')).toBe('3000ms')
    expect(notice.querySelector('[data-offline-message]')!.textContent)
      .toBe('離線資料已準備完成，可加入手機主畫面捷徑後離線使用。')
    expect(notice.querySelector('[data-offline-icon]')!.textContent).toBe('✓')

    vi.advanceTimersByTime(2_999)
    expect(notice.hidden).toBe(false)
    vi.advanceTimersByTime(1)
    expect(notice.hidden).toBe(true)
    expect(notice.classList.contains('is-visible')).toBe(false)
  })

  it('可手動關閉，失敗提示不會被完成提示的計時器誤關閉', () => {
    vi.useFakeTimers()
    const notice = createNotice()
    showOfflineNotice(notice, 'ready', 3_000)
    showOfflineNotice(notice, 'failed', 3_000)

    vi.advanceTimersByTime(3_000)
    expect(notice.hidden).toBe(false)
    expect(notice.dataset.state).toBe('failed')
    expect(notice.querySelector('[data-offline-message]')!.textContent).toContain('離線資料準備失敗')

    notice.querySelector<HTMLButtonElement>('[data-dismiss-offline]')!.click()
    expect(notice.hidden).toBe(true)
  })
})
