export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) {
    return
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', {
        scope: '/',
      })
      .catch((error: unknown) => {
        console.error('Service Worker 註冊失敗：', error)
      })
  })
}