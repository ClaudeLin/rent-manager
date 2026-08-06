import { afterEach, describe, expect, it, vi } from 'vitest'
import { initReportForm, reportErrorMessage } from '../../src/lib/report-form'

function setup({ turnstileToken = 'test-token' }: { turnstileToken?: string } = {}) {
  document.body.dataset.track = 'renew'
  history.replaceState({}, '', '/renew/practice/')
  document.body.innerHTML = `<div id="root"><main id="app" data-view="chapter">
    <button data-report-open data-report-bank-label="換證・有詳解題庫">問題回報</button>
    <section class="question-card" data-question-key="c2-s1-q17" data-question-number="23"></section></main>
    <dialog data-report-dialog>
      <form data-report-form data-endpoint="/api/forms/issue-report">
        <select name="issueType"><option value="question">題目錯誤</option></select>
        <select name="track" data-report-track><option value="init">初訓</option><option value="renew">換證</option></select>
        <select name="bank" data-report-bank><option value="unknown">不確定</option><option value="withLaw">有詳解</option></select>
        <select name="questionContext" data-report-question-context><option value="random">隨機</option><option value="chapter">章節</option></select>
        <input name="chapter" data-report-chapter />
        <input name="questionNumber" data-report-question-number />
        <input name="questionId" type="hidden" data-report-question-id />
        <input name="reporterName" />
        <input name="reporterEmail" type="email" />
        <textarea name="description"></textarea>
        <input name="attachment" type="file" accept="image/png,image/jpeg,image/webp" />
        <input name="pagePath" data-report-page />
        <input name="company" />
        <input type="checkbox" name="privacyConfirmed" checked />
        <input name="cf-turnstile-response" value="${turnstileToken}" />
        <p data-report-status tabindex="-1" hidden></p>
        <button type="submit">送出</button>
        <button type="button" data-report-close>取消</button>
      </form>
    </dialog>
  </div>`
  const root = document.querySelector<HTMLElement>('#root')!
  root.querySelector<HTMLInputElement>('[name="reporterName"]')!.value = '王小明'
  root.querySelector<HTMLInputElement>('[name="reporterEmail"]')!.value = 'learner@example.com'
  root.querySelector<HTMLTextAreaElement>('[name="description"]')!.value = '這是一段足夠長的問題描述。'
  const dialog = root.querySelector<HTMLDialogElement>('dialog')!
  dialog.showModal = vi.fn(() => { dialog.open = true })
  dialog.close = vi.fn(() => { dialog.open = false; dialog.dispatchEvent(new Event('close')) })
  initReportForm(root)
  return { root, dialog, opener: root.querySelector<HTMLButtonElement>('[data-report-open]')!, form: root.querySelector<HTMLFormElement>('form')!, status: root.querySelector<HTMLElement>('[data-report-status]')! }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('問題回報表單', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
    delete document.body.dataset.track
  })

  it('只將固定公開錯誤碼映射為文案，未知與 prototype 名稱使用 generic fallback', () => {
    expect(reportErrorMessage('invalid_email')).toContain('Email 格式不正確')
    expect(reportErrorMessage('verification_failed')).toContain('回報未送出')
    expect(reportErrorMessage('service_unavailable')).toContain('回報未送出')
    expect(reportErrorMessage('invalid_attachment')).toContain('附圖')
    for (const code of ['constructor', 'toString', '__proto__', 'internal provider detail']) {
      expect(reportErrorMessage(code)).toBe('回報未送出，請稍後再試，或改用 GitHub Issues。您填寫的內容已保留。')
    }
  })

  it('向使用者帶入可讀題次，技術識別碼只以隱藏欄位附帶，並還原 focus', () => {
    const { root, dialog, opener, form } = setup()
    opener.focus()
    opener.click()
    expect(dialog.showModal).toHaveBeenCalledOnce()
    expect(form.elements.namedItem('track')).toHaveProperty('value', 'renew')
    expect(form.elements.namedItem('bank')).toHaveProperty('value', 'withLaw')
    expect(form.elements.namedItem('questionContext')).toHaveProperty('value', 'chapter')
    expect(form.elements.namedItem('chapter')).toHaveProperty('value', '2')
    expect(form.elements.namedItem('questionNumber')).toHaveProperty('value', '23')
    expect(form.elements.namedItem('questionId')).toHaveProperty('value', 'c2-s1-q17')
    expect(form.elements.namedItem('pagePath')).toHaveProperty('value', '/renew/practice/')
    root.querySelector<HTMLButtonElement>('[data-report-close]')!.click()
    expect(document.activeElement).toBe(opener)
  })

  it('成功才清空內容，request 不包含 query/hash 且未勾選時不傳裝置摘要', async () => {
    const { opener, form, status } = setup()
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      expect(body.pagePath).toBe('/renew/practice/')
      expect(body.deviceSummary).toBeUndefined()
      expect(body.turnstileToken).toBe('test-token')
      expect(body['cf-turnstile-response']).toBeUndefined()
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    opener.click()
    form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }))
    await flush()
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(status.textContent).toContain('回報已成功寄出')
    expect((form.elements.namedItem('description') as HTMLTextAreaElement).value).toBe('')
    vi.unstubAllGlobals()
  })

  it('將單張 PNG 轉成無 data URL 前綴的 base64 附件欄位', async () => {
    const originalReadAsDataUrl = FileReader.prototype.readAsDataURL
    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (this: FileReader, blob: Blob) {
      setTimeout(() => originalReadAsDataUrl.call(this, blob), 30)
    })
    const { opener, form } = setup()
    const fileInput = form.elements.namedItem('attachment') as HTMLInputElement
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], 'screen.png', { type: 'image/png' })
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] })
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      expect(body.attachment).toEqual({ type: 'image/png', content: 'iVBORw0KGgo=' })
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    opener.click()
    form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    vi.unstubAllGlobals()
  })

  it('拒絕非圖片格式或超過 1 MiB 的附圖且不送 request', async () => {
    for (const file of [
      new File(['gif'], 'screen.gif', { type: 'image/gif' }),
      new File([new Uint8Array(1_048_577)], 'large.png', { type: 'image/png' }),
    ]) {
      const { opener, form, status } = setup()
      Object.defineProperty(form.elements.namedItem('attachment'), 'files', { configurable: true, value: [file] })
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      opener.click()
      form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }))
      await flush()
      expect(fetchMock).not.toHaveBeenCalled()
      expect(status.textContent).toContain('附圖')
      vi.unstubAllGlobals()
    }
  })

  it('缺少安全驗證 token 時不送 request，保留內容並以一般訊息提示未送出', async () => {
    const { opener, form, status } = setup({ turnstileToken: '' })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    opener.click()
    form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }))
    await flush()
    expect(fetchMock).not.toHaveBeenCalled()
    expect((form.elements.namedItem('description') as HTMLTextAreaElement).value).toContain('足夠長')
    expect(status.getAttribute('role')).toBe('alert')
    expect(status.textContent).toContain('回報未送出')
    expect(status.textContent).not.toContain('site key')
    expect(status.textContent).not.toContain('Turnstile')
    vi.unstubAllGlobals()
  })

  it('delivery failure 與非 JSON edge response 都保留使用者內容且不顯示 raw body', async () => {
    for (const response of [
      new Response(JSON.stringify({ ok: false, error: 'delivery_failed' }), { status: 502, headers: { 'content-type': 'application/json' } }),
      new Response('<html>cloud edge detail</html>', { status: 403, headers: { 'content-type': 'text/html' } }),
    ]) {
      const { opener, form, status } = setup()
      vi.stubGlobal('fetch', vi.fn(async () => response))
      opener.click()
      form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }))
      await flush()
      expect((form.elements.namedItem('description') as HTMLTextAreaElement).value).toContain('足夠長')
      expect(status.getAttribute('role')).toBe('alert')
      expect(status.textContent).not.toContain('cloud edge detail')
      vi.unstubAllGlobals()
    }
  })
})
