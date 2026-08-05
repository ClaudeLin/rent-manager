export type NavigationRoutes = { home: string; practice: string; chapter: string; mock: string; wrong: string; about: string }

type NavigationOptions = {
  routes: NavigationRoutes
  mockEnabled: boolean
  bankLabel?: string
}

const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!)

export const navigationLabels = {
  changeBank: '更換題庫版本',
  switchTrack: '切換初訓／換證',
  openMenu: '開啟選單',
  closeMenu: '關閉選單',
} as const

export function renderPrimaryHeader({ routes, mockEnabled, bankLabel }: NavigationOptions): string {
  return `<header class="brand"><a class="brand-home" href="${escapeHtml(routes.home)}" aria-label="返回入口">租賃住宅管理人員證照題庫練習</a><strong>Rental Housing Manager</strong><button type="button" class="mobile-menu-toggle" data-mobile-menu-toggle data-action="toggle-mobile-menu" aria-label="${navigationLabels.openMenu}" aria-expanded="false" aria-controls="primary-nav"><span class="hamburger-icon" aria-hidden="true"><span class="hamburger-line"></span><span class="hamburger-line"></span><span class="hamburger-line"></span></span></button><small>Practice${mockEnabled ? ' • Mock Exam' : ''} • Review${bankLabel ? `・目前：${escapeHtml(bankLabel)}` : ''}</small><nav id="primary-nav" class="primary-nav" aria-label="主要導覽"><a href="${escapeHtml(routes.practice)}">全題練習</a><a href="${escapeHtml(routes.chapter)}">章節練習</a>${mockEnabled ? `<a href="${escapeHtml(routes.mock)}">模擬考</a>` : ''}<a href="${escapeHtml(routes.wrong)}">錯題回顧</a><a href="/about/">關於本站</a><a href="${escapeHtml(routes.home)}">${navigationLabels.changeBank}</a><a href="/">${navigationLabels.switchTrack}</a></nav></header>`
}

export function renderSharedHeader(): string {
  return `<header class="brand"><a class="brand-home" href="/" aria-label="返回題庫選擇">租賃住宅管理人員證照題庫練習</a><strong>Rental Housing Manager</strong><button type="button" class="mobile-menu-toggle" data-mobile-menu-toggle aria-label="${navigationLabels.openMenu}" aria-expanded="false" aria-controls="primary-nav"><span class="hamburger-icon" aria-hidden="true"><span class="hamburger-line"></span><span class="hamburger-line"></span><span class="hamburger-line"></span></span></button><small>Practice • Review</small><nav id="primary-nav" class="primary-nav" aria-label="主要導覽"><a href="/">題庫選擇</a><a href="/init/">初訓題庫</a><a href="/renew/">換證題庫</a><a href="/about/" aria-current="page">關於本站</a></nav></header>`
}

export function initMobileMenu(root: ParentNode = document): void {
  root.querySelectorAll<HTMLButtonElement>('[data-mobile-menu-toggle]').forEach((toggle) => {
    if (toggle.dataset.mobileMenuBound) return
    toggle.dataset.mobileMenuBound = 'true'
    toggle.addEventListener('click', () => {
      const navigationId = toggle.getAttribute('aria-controls')
      const navigation = navigationId ? root.querySelector<HTMLElement>(`#${navigationId}`) : null
      const expanded = toggle.getAttribute('aria-expanded') === 'true'
      const nextExpanded = !expanded
      toggle.setAttribute('aria-expanded', String(nextExpanded))
      toggle.setAttribute('aria-label', nextExpanded ? navigationLabels.closeMenu : navigationLabels.openMenu)
      navigation?.classList.toggle('is-open', nextExpanded)
    })
  })
}
