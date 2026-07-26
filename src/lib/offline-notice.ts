import type { ServiceWorkerStatus } from './pwa'

const timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>()

const content: Record<ServiceWorkerStatus, { icon: string; message: string }> = {
  ready: {
    icon: '✓',
    message: '離線資料已準備完成，可加入手機主畫面捷徑後離線使用。',
  },
  unsupported: {
    icon: 'i',
    message: '目前瀏覽器不支援離線安裝。',
  },
  failed: {
    icon: '!',
    message: '離線資料準備失敗，使用時請保持網路連線，以獲得最佳體驗。',
  },
}

export function dismissOfflineNotice(notice: HTMLElement): void {
  const timer = timers.get(notice)
  if (timer !== undefined) clearTimeout(timer)
  timers.delete(notice)
  notice.classList.remove('is-visible')
  notice.hidden = true
}

export function showOfflineNotice(notice: HTMLElement, status: ServiceWorkerStatus, durationMs = 3_000): void {
  const previousTimer = timers.get(notice)
  if (previousTimer !== undefined) clearTimeout(previousTimer)
  timers.delete(notice)

  const state = content[status]
  notice.dataset.state = status
  notice.style.setProperty('--offline-toast-duration', `${durationMs}ms`)
  notice.querySelector<HTMLElement>('[data-offline-icon]')!.textContent = state.icon
  notice.querySelector<HTMLElement>('[data-offline-message]')!.textContent = state.message
  notice.querySelector<HTMLButtonElement>('[data-dismiss-offline]')!.onclick = () => dismissOfflineNotice(notice)
  notice.hidden = false
  notice.classList.add('is-visible')

  if (status === 'ready') {
    const timer = setTimeout(() => dismissOfflineNotice(notice), durationMs)
    timers.set(notice, timer)
  }
}
