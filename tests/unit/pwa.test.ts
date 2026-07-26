import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerServiceWorker } from '../../src/lib/pwa'

function installServiceWorkerMock(value: object): void {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value,
  })
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'serviceWorker')
  vi.restoreAllMocks()
})

describe('Service Worker 註冊狀態', () => {
  it('已有 active worker 時明確檢查更新並安靜完成', async () => {
    const registration = {
      active: {},
      installing: null,
      update: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    const register = vi.fn()
    installServiceWorkerMock({
      getRegistration: vi.fn().mockResolvedValue(registration),
      register,
    })

    await expect(registerServiceWorker()).resolves.toBe('existing')
    expect(registration.update).toHaveBeenCalledOnce()
    expect(register).not.toHaveBeenCalled()
  })

  it('更新檢查失敗時沿用既有 worker 並清除 listener', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const registration = {
      active: {},
      installing: null,
      update: vi.fn().mockRejectedValue(new Error('offline')),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    installServiceWorkerMock({
      getRegistration: vi.fn().mockResolvedValue(registration),
      register: vi.fn(),
    })

    await expect(registerServiceWorker()).resolves.toBe('existing')
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('繼續使用既有離線資料'),
      expect.any(Error),
    )
    expect(registration.removeEventListener).toHaveBeenCalledWith(
      'updatefound',
      expect.any(Function),
    )
  })

  it('update 呼叫後才出現 installing worker 時仍會回報更新完成', async () => {
    let updateFound: (() => void) | undefined
    let stateChange: (() => void) | undefined
    const installing = {
      state: 'installing',
      addEventListener: vi.fn((_event: string, listener: () => void) => { stateChange = listener }),
    }
    const registration = {
      active: {},
      installing: null as typeof installing | null,
      addEventListener: vi.fn((_event: string, listener: () => void) => { updateFound = listener }),
      removeEventListener: vi.fn(),
      update: vi.fn().mockImplementation(async () => {
        registration.installing = installing
        updateFound!()
      }),
    }
    installServiceWorkerMock({
      getRegistration: vi.fn().mockResolvedValue(registration),
      register: vi.fn(),
    })

    const result = registerServiceWorker()
    await vi.waitFor(() => expect(stateChange).toBeTypeOf('function'))
    installing.state = 'installed'
    stateChange!()

    await expect(result).resolves.toBe('updated')
    expect(registration.update).toHaveBeenCalledOnce()
  })

  it('首次安裝轉為 redundant 時回報失敗，不會永久等待 ready', async () => {
    let stateChange: (() => void) | undefined
    const installing = {
      state: 'installing',
      addEventListener: vi.fn((_event: string, listener: () => void) => { stateChange = listener }),
    }
    const registration = { active: null, waiting: null, installing }
    installServiceWorkerMock({
      getRegistration: vi.fn().mockResolvedValue(undefined),
      register: vi.fn().mockResolvedValue(registration),
      ready: new Promise(() => undefined),
    })

    const result = registerServiceWorker()
    await vi.waitFor(() => expect(stateChange).toBeTypeOf('function'))
    installing.state = 'redundant'
    stateChange!()

    await expect(result).resolves.toBe('failed')
  })
})
