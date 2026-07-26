export type ServiceWorkerStatus =
  | 'ready'
  | 'updated'
  | 'existing'
  | 'unsupported'
  | 'failed'

function installed(worker: ServiceWorker): Promise<boolean> {
  if (worker.state === 'installed' || worker.state === 'activated') return Promise.resolve(true)
  if (worker.state === 'redundant') return Promise.resolve(false)

  return new Promise((resolve) => {
    worker.addEventListener('statechange', () => {
      resolve(worker.state === 'installed' || worker.state === 'activated')
    }, { once: true })
  })
}

async function checkForUpdate(registration: ServiceWorkerRegistration): Promise<ServiceWorkerStatus> {
  let updateWorker = registration.installing
  const captureUpdate = () => {
    if (registration.installing) updateWorker = registration.installing
  }

  registration.addEventListener('updatefound', captureUpdate)
  try {
    await registration.update()
    captureUpdate()
  } catch (error: unknown) {
    console.warn('Service Worker 更新檢查失敗，繼續使用既有離線資料：', error)
    return 'existing'
  } finally {
    registration.removeEventListener('updatefound', captureUpdate)
  }

  if (!updateWorker) return 'existing'
  return await installed(updateWorker) ? 'updated' : 'existing'
}

export async function registerServiceWorker(): Promise<ServiceWorkerStatus> {
  if (!('serviceWorker' in navigator)) {
    return 'unsupported'
  }

  try {
    const existingRegistration = await navigator.serviceWorker.getRegistration('/')
    if (existingRegistration?.active) {
      return await checkForUpdate(existingRegistration)
    }

    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    })

    if (registration.active || registration.waiting) return 'ready'
    if (!registration.installing) return 'failed'

    // Workbox precache 會在 install 階段完成；redundant 代表安裝失敗。
    return await installed(registration.installing) ? 'ready' : 'failed'
  } catch (error: unknown) {
    console.error('Service Worker 註冊失敗：', error)
    return 'failed'
  }
}