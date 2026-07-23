export type ServiceWorkerStatus =
  | 'ready'
  | 'unsupported'
  | 'failed'

export async function registerServiceWorker(): Promise<ServiceWorkerStatus> {
  if (!('serviceWorker' in navigator)) {
    return 'unsupported'
  }

  try {
    await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    })

    // 等待 Service Worker 完成安裝並進入 active 狀態。
    // Workbox precache 也會在 install 階段完成。
    await navigator.serviceWorker.ready

    return 'ready'
  } catch (error: unknown) {
    console.error('Service Worker 註冊失敗：', error)
    return 'failed'
  }
}