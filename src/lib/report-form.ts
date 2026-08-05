const FALLBACK_ERROR = '回報未送出，請稍後再試，或改用 GitHub Issues。您填寫的內容已保留。'

export function reportErrorMessage(code: string): string {
  switch (code) {
    case 'verification_failed': return '安全驗證未完成，回報未送出。請重新驗證後再試，填寫內容已保留。'
    case 'delivery_failed': return FALLBACK_ERROR
    case 'service_unavailable': return FALLBACK_ERROR
    case 'invalid_email': return 'Email 格式不正確，回報未送出。請確認後再試，填寫內容已保留。'
    case 'invalid_attachment': return '附圖需為 PNG、JPEG 或 WebP，且不可超過 1 MiB；回報未送出，填寫內容已保留。'
    case 'invalid_fields': return '部分欄位內容不正確，回報未送出。請檢查後再試，填寫內容已保留。'
    default: return FALLBACK_ERROR
  }
}

type TurnstileWindow = Window & { turnstile?: { reset: (widget?: Element) => void } }
const attachmentTypes = new Set(['image/png', 'image/jpeg', 'image/webp'])
const maxAttachmentBytes = 1_048_576

async function encodeAttachment(file: File | undefined): Promise<{ type: string; content: string } | null> {
  if (!file || file.size === 0) return null
  if (!attachmentTypes.has(file.type) || file.size > maxAttachmentBytes) throw new Error('invalid attachment')
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('invalid attachment')))
    reader.addEventListener('error', () => reject(new Error('invalid attachment')))
    reader.readAsDataURL(file)
  })
  const content = dataUrl.split(',', 2)[1]
  if (!content) throw new Error('invalid attachment')
  return { type: file.type, content }
}

function setStatus(status: HTMLElement, message: string, error: boolean): void {
  status.textContent = message
  status.hidden = false
  status.setAttribute('role', error ? 'alert' : 'status')
  status.focus()
}

function setContext(form: HTMLFormElement, trigger: HTMLElement): void {
  const bodyTrack = document.body.dataset.track
  const track = trigger.dataset.reportTrack || bodyTrack || ''
  const trackSelect = form.querySelector<HTMLSelectElement>('[data-report-track]')
  if (trackSelect && (track === 'init' || track === 'renew')) trackSelect.value = track

  const bankLabel = trigger.dataset.reportBankLabel || ''
  const bankSelect = form.querySelector<HTMLSelectElement>('[data-report-bank]')
  if (bankSelect && bankLabel) {
    bankSelect.value = bankLabel.includes('有詳解') ? 'withLaw' : bankLabel.includes('只有答案') ? 'withoutLaw' : 'unknown'
  }

  const currentView = document.querySelector<HTMLElement>('#app')?.dataset.view || ''
  const contextByView: Record<string, string> = { practice: 'random', chapter: 'chapter', mock: 'mock', wrong: 'wrong' }
  const questionContext = trigger.dataset.reportQuestionContext || contextByView[currentView] || 'other'
  const contextSelect = form.querySelector<HTMLSelectElement>('[data-report-question-context]')
  if (contextSelect) contextSelect.value = questionContext

  const questionCard = document.querySelector<HTMLElement>('.question-card[data-question-key]')
  const questionId = questionCard?.dataset.questionKey || trigger.dataset.reportQuestion || ''
  const questionNumber = questionCard?.dataset.questionNumber || trigger.dataset.reportQuestionNumber || ''
  const questionNumberInput = form.querySelector<HTMLInputElement>('[data-report-question-number]')
  const questionIdInput = form.querySelector<HTMLInputElement>('[data-report-question-id]')
  const chapterInput = form.querySelector<HTMLInputElement | HTMLSelectElement>('[data-report-chapter]')
  if (questionNumberInput) questionNumberInput.value = questionNumber
  if (questionIdInput) questionIdInput.value = questionId
  const chapter = trigger.dataset.reportChapter || questionId.match(/^c(\d+)-/)?.[1] || ''
  if (chapterInput) chapterInput.value = chapter

  const page = form.querySelector<HTMLInputElement>('[data-report-page]')
  if (page) page.value = window.location.pathname
  if (questionId) {
    const type = form.querySelector<HTMLSelectElement>('[name="issueType"]')
    if (type && !type.value) type.value = 'question'
  }
}

export function initReportForm(root: ParentNode = document): void {
  const dialog = root.querySelector<HTMLDialogElement>('[data-report-dialog]')
  const form = dialog?.querySelector<HTMLFormElement>('[data-report-form]')
  const status = form?.querySelector<HTMLElement>('[data-report-status]')
  if (!dialog || !form || !status || dialog.dataset.reportBound) return
  dialog.dataset.reportBound = 'true'
  let opener: HTMLElement | null = null

  root.addEventListener('click', (event) => {
    const target = event.target as Element | null
    const openButton = target?.closest<HTMLElement>('[data-report-open]')
    if (openButton) {
      opener = openButton
      status.hidden = true
      setContext(form, openButton)
      if (!dialog.open) dialog.showModal()
      form.querySelector<HTMLElement>('select, input, textarea')?.focus()
      return
    }
    if (target?.closest('[data-report-close]')) dialog.close()
  })

  dialog.addEventListener('close', () => opener?.focus())
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!form.reportValidity()) return
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')
    const endpoint = form.dataset.endpoint
    if (!submit || !endpoint) return

    const data = new FormData(form)
    const turnstileToken = String(data.get('cf-turnstile-response') ?? '')
    if (!turnstileToken) {
      setStatus(status, FALLBACK_ERROR, true)
      return
    }

    let attachment: { type: string; content: string } | null
    try {
      attachment = await encodeAttachment(form.querySelector<HTMLInputElement>('[name="attachment"]')?.files?.[0])
    } catch {
      setStatus(status, reportErrorMessage('invalid_attachment'), true)
      return
    }

    const body = Object.fromEntries(data.entries()) as Record<string, FormDataEntryValue | { type: string; content: string }>
    delete body['cf-turnstile-response']
    delete body.attachment
    if (attachment) body.attachment = attachment
    body.turnstileToken = turnstileToken
    body.pagePath = window.location.pathname
    if (body.includeDevice === 'on') body.deviceSummary = navigator.userAgent.slice(0, 300)
    delete body.includeDevice

    submit.disabled = true
    submit.setAttribute('aria-busy', 'true')
    status.hidden = true
    let failure = FALLBACK_ERROR
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      let result: unknown = null
      if (response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
        try { result = await response.json() } catch { result = null }
      }
      const payload = result && typeof result === 'object' ? result as { ok?: unknown; error?: unknown } : null
      if (!response.ok || payload?.ok !== true) {
        failure = reportErrorMessage(typeof payload?.error === 'string' ? payload.error : '')
        throw new Error('report submission failed')
      }
      form.reset()
      setStatus(status, '回報已成功寄出，感謝協助改善題庫。', false)
    } catch {
      setStatus(status, failure, true)
    } finally {
      const widget = form.querySelector<Element>('.cf-turnstile')
      const turnstile = (window as TurnstileWindow).turnstile
      if (widget && turnstile) turnstile.reset(widget)
      submit.disabled = false
      submit.removeAttribute('aria-busy')
    }
  })
}
