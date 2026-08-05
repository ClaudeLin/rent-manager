import { expect, test } from '@playwright/test'

const init = { home: '/init/', practice: '/init/practice/', chapter: '/init/practice/chapter/', mock: '/init/mock/', wrong: '/init/wrong/', about: '/init/about/' }
const renew = { home: '/renew/', practice: '/renew/practice/', chapter: '/renew/practice/chapter/', wrong: '/renew/wrong/', about: '/renew/about/' }

async function selectBank(page: import('@playwright/test').Page, home: string): Promise<void> {
  await page.goto(home)
  await page.getByRole('button', { name: '有詳解題庫' }).click()
  await expect(page.locator('[data-question-key]')).toBeVisible()
}

async function assertHeaderActions(page: import('@playwright/test').Page, routes: typeof init | typeof renew): Promise<void> {
  await expect(page.locator('body')).toHaveAttribute('data-track', routes.home === renew.home ? 'renew' : 'init')
  const nav = page.getByRole('navigation', { name: '主要導覽', includeHidden: true })
  if ((page.viewportSize()?.width ?? 0) < 760) {
    const menu = page.locator('[data-mobile-menu-toggle]')
    await expect(menu).toBeVisible()
    await menu.click()
  } else {
    await expect(nav).toBeVisible()
  }
  await expect(nav.getByRole('link', { name: '更換題庫版本' })).toHaveAttribute('href', routes.home)
  await expect(nav.getByRole('link', { name: '切換初訓／換證' })).toHaveAttribute('href', '/')
}

test('手機題庫選項維持各自淺色，只有按下期間變深且不殘留 hover', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', '手機觸控色彩專屬驗證')

  const initLight = { background: 'rgb(230, 241, 248)', color: 'rgb(23, 79, 120)', border: 'rgb(110, 159, 190)' }
  const renewLight = { background: 'rgb(229, 243, 240)', color: 'rgb(34, 95, 87)', border: 'rgb(108, 166, 156)' }
  const initDark = { background: 'rgb(23, 79, 120)', color: 'rgb(255, 255, 255)', border: 'rgb(23, 79, 120)' }
  const renewDark = { background: 'rgb(34, 95, 87)', color: 'rgb(255, 255, 255)', border: 'rgb(34, 95, 87)' }
  const lightPair = { init: initLight, renew: renewLight }

  async function assertStateSequence(name: '初訓題庫' | '換證題庫') {
    await page.goto('/')
    const link = page.getByRole('link', { name })
    await expect(link).toBeVisible()
    const devtools = await page.context().newCDPSession(page)
    await devtools.send('DOM.enable')
    await devtools.send('CSS.enable')
    const { root } = await devtools.send('DOM.getDocument')
    const selector = name === '初訓題庫' ? 'a[href="/init/"]' : 'a[href="/renew/"]'
    const { nodeId } = await devtools.send('DOM.querySelector', { nodeId: root.nodeId, selector })
    const readColors = (element: HTMLElement) => {
      const style = getComputedStyle(element)
      return { background: style.backgroundColor, color: style.color, border: style.borderColor }
    }
    const readPair = async () => ({
      init: await page.getByRole('link', { name: '初訓題庫' }).evaluate(readColors),
      renew: await page.getByRole('link', { name: '換證題庫' }).evaluate(readColors),
    })
    const force = async (forcedPseudoClasses: string[]) => {
      await devtools.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses })
      await page.waitForTimeout(170)
      return readPair()
    }

    expect(await force([])).toEqual(lightPair)
    expect(await force(['hover'])).toEqual(lightPair)
    expect(await force(['hover', 'active'])).toEqual(name === '初訓題庫'
      ? { init: initDark, renew: renewLight }
      : { init: initLight, renew: renewDark })
    expect(await force(['hover'])).toEqual(lightPair)
    expect(await force([])).toEqual(lightPair)
  }

  await assertStateSequence('初訓題庫')
  await assertStateSequence('換證題庫')
})

test('初訓全站使用藍色主題，換證全站使用綠色主題', async ({ page }) => {
  const themes = [
    {
      routes: init,
      track: 'init',
      themeColor: '#143b63',
      deep: 'rgb(20, 59, 99)',
      accent: 'rgb(23, 105, 170)',
      soft: 'rgb(232, 242, 249)',
      pale: 'rgb(237, 246, 252)',
      link: 'rgb(16, 95, 154)',
    },
    {
      routes: renew,
      track: 'renew',
      themeColor: '#174b42',
      deep: 'rgb(23, 75, 66)',
      accent: 'rgb(40, 114, 100)',
      soft: 'rgb(229, 243, 240)',
      pale: 'rgb(237, 248, 245)',
      link: 'rgb(23, 105, 92)',
    },
  ] as const

  for (const theme of themes) {
    await page.goto(theme.routes.home)
    await page.mouse.move(0, 0)
    await expect(page.locator('body')).toHaveAttribute('data-track', theme.track)
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', theme.themeColor)
    await expect(page.locator('.question-bank-choice h1')).toHaveCSS('color', theme.deep)
    const bankButtons = page.locator('.variant-choice-actions .button')
    await expect(bankButtons).toHaveCount(2)
    for (const bankButton of await bankButtons.all()) {
      await expect(bankButton).toHaveCSS('background-color', theme.soft)
      await expect(bankButton).toHaveCSS('color', theme.deep)
      await expect(bankButton).toHaveCSS('border-color', theme.accent)
    }

    await bankButtons.first().click()
    await expect(page.locator('[data-question-key]')).toBeVisible()
    await expect(page.locator('body')).toHaveAttribute('data-track', theme.track)
    await expect(page.locator('.brand')).toHaveCSS('background-color', theme.deep)
    await expect(page.locator('[data-action="check-practice"]')).toHaveCSS('background-color', theme.accent)
    await page.locator('[data-option="A"]').click()
    await expect(page.locator('[data-option="A"]')).toHaveCSS('background-color', theme.pale)
    await expect(page.locator('[data-option="A"]')).toHaveCSS('border-color', theme.accent)

    await page.goto(theme.routes.about)
    await expect(page.locator('body')).toHaveAttribute('data-track', theme.track)
    await expect(page.locator('.brand')).toHaveCSS('background-color', theme.deep)
    await expect(page.locator('.about-page h1')).toHaveCSS('color', theme.deep)
    await expect(page.locator('.about-page a').first()).toHaveCSS('color', theme.link)
  }
})

test('手機雙題庫版本按鈕維持同軌淺色，只有按下項目短暫變深', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', '手機觸控色彩專屬驗證')
  const cases = [
    {
      home: init.home,
      light: { background: 'rgb(232, 242, 249)', color: 'rgb(20, 59, 99)', border: 'rgb(23, 105, 170)' },
      dark: { background: 'rgb(11, 65, 104)', color: 'rgb(255, 255, 255)', border: 'rgb(11, 65, 104)' },
    },
    {
      home: renew.home,
      light: { background: 'rgb(229, 243, 240)', color: 'rgb(23, 75, 66)', border: 'rgb(40, 114, 100)' },
      dark: { background: 'rgb(22, 72, 63)', color: 'rgb(255, 255, 255)', border: 'rgb(22, 72, 63)' },
    },
  ] as const

  for (const item of cases) {
    await page.goto(item.home)
    const devtools = await page.context().newCDPSession(page)
    await devtools.send('DOM.enable')
    await devtools.send('CSS.enable')
    const { root } = await devtools.send('DOM.getDocument')
    const { nodeId } = await devtools.send('DOM.querySelector', { nodeId: root.nodeId, selector: '[data-bank="withLaw"]' })
    const readColors = (element: HTMLElement) => {
      const style = getComputedStyle(element)
      return { background: style.backgroundColor, color: style.color, border: style.borderColor }
    }
    const readPair = async () => ({
      pressed: await page.locator('[data-bank="withLaw"]').evaluate(readColors),
      other: await page.locator('[data-bank="withoutLaw"]').evaluate(readColors),
    })
    const force = async (forcedPseudoClasses: string[]) => {
      await devtools.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses })
      await page.waitForTimeout(170)
      return readPair()
    }

    expect(await force([])).toEqual({ pressed: item.light, other: item.light })
    expect(await force(['hover'])).toEqual({ pressed: item.light, other: item.light })
    expect(await force(['hover', 'active'])).toEqual({ pressed: item.dark, other: item.light })
    expect(await force(['hover'])).toEqual({ pressed: item.light, other: item.light })
    expect(await force([])).toEqual({ pressed: item.light, other: item.light })
  }
})

test('手機 About 共用可存取漢堡選單且無橫向溢位', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', '手機 UX 專屬驗證')
  for (const routes of [init, renew]) {
    await page.goto(routes.about)
    const menu = page.locator('[data-mobile-menu-toggle]')
    const nav = page.getByRole('navigation', { name: '主要導覽' })
    await expect(menu).toHaveAccessibleName('開啟選單')
    await expect(menu).toHaveAttribute('aria-expanded', 'false')
    await expect(nav).toBeHidden()
    await menu.click()
    await expect(menu).toHaveAttribute('aria-expanded', 'true')
    await expect(menu).toHaveAccessibleName('關閉選單')
    await expect(nav).toBeVisible()
    for (const link of await nav.getByRole('link').all()) {
      const box = await link.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.width).toBeGreaterThanOrEqual(44)
      expect(box!.height).toBeGreaterThanOrEqual(44)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
})

test('所有題庫頁的 Header 明確分開題庫版本與訓練類型', async ({ page }) => {
  await selectBank(page, init.home)
  for (const path of [init.practice, init.chapter, init.wrong, init.about, init.mock]) {
    await page.goto(path)
    await assertHeaderActions(page, init)
  }
  await selectBank(page, renew.home)
  for (const path of [renew.practice, renew.chapter, renew.wrong, renew.about]) {
    await page.goto(path)
    await assertHeaderActions(page, renew)
    await expect(page.getByRole('link', { name: '模擬考' })).toHaveCount(0)
  }
})

test('實際切換訓練類型後，兩組題庫版本、session 與 history 都保持獨立', async ({ page }) => {
  for (const routes of [init, renew]) {
    await page.goto(routes.home)
    await expect(page.getByRole('link', { name: '切換初訓／換證' })).toHaveAttribute('href', '/')
  }

  await selectBank(page, renew.home)
  const renewQuestion = await page.locator('[data-question-key]').getAttribute('data-question-key')
  await page.locator('[data-option="A"]').click()
  await page.locator('[data-action="check-practice"]').click()
  await assertHeaderActions(page, renew)
  await page.getByRole('navigation', { name: '主要導覽' }).getByRole('link', { name: '切換初訓／換證' }).click()
  await expect(page).toHaveURL('/')

  await page.getByRole('link', { name: '初訓題庫' }).click()
  await page.getByRole('button', { name: '有詳解題庫' }).click()
  const initQuestion = await page.locator('[data-question-key]').getAttribute('data-question-key')
  await page.locator('[data-option="B"]').click()
  await page.locator('[data-action="check-practice"]').click()

  const storageKeys = [
    'rent-exam-question-bank-v1', 'rent-exam-session-v1', 'rent-exam-history-v1',
    'rent-exam-renew-question-bank-v1', 'rent-exam-renew-session-v1', 'rent-exam-renew-history-v1',
  ]
  const storageSnapshot = (keys: string[]) => Object.fromEntries(keys.map((key) => {
    const raw = localStorage.getItem(key)
    if (!raw || !key.includes('-session-')) return [key, raw]
    const session = JSON.parse(raw)
    delete session.updatedAt
    return [key, JSON.stringify(session)]
  }))
  const beforeSwitching = await page.evaluate(storageSnapshot, storageKeys)
  expect(Object.values(beforeSwitching).every(Boolean)).toBe(true)

  await assertHeaderActions(page, init)
  await page.getByRole('navigation', { name: '主要導覽' }).getByRole('link', { name: '切換初訓／換證' }).click()
  await page.getByRole('link', { name: '換證題庫' }).click()
  await page.getByRole('link', { name: '繼續上次練習' }).click()
  await expect(page.locator('[data-question-key]')).toHaveAttribute('data-question-key', renewQuestion!)
  await expect(page.locator('[data-option="A"]')).toHaveAttribute('aria-pressed', 'true')

  await assertHeaderActions(page, renew)
  await page.getByRole('navigation', { name: '主要導覽' }).getByRole('link', { name: '切換初訓／換證' }).click()
  await page.getByRole('link', { name: '初訓題庫' }).click()
  await page.getByRole('link', { name: '繼續上次練習' }).click()
  await expect(page.locator('[data-question-key]')).toHaveAttribute('data-question-key', initQuestion!)
  await expect(page.locator('[data-option="B"]')).toHaveAttribute('aria-pressed', 'true')

  const afterSwitching = await page.evaluate(storageSnapshot, storageKeys)
  expect(afterSwitching).toEqual(beforeSwitching)
})

test('桌面導覽在各題庫頁保持可讀且不溢位', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '桌面 UX 專屬驗證')
  await selectBank(page, init.home)
  for (const path of [init.about, init.practice, init.chapter, init.wrong, init.mock]) {
    await page.goto(path)
    await expect(page.getByRole('navigation', { name: '主要導覽' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
  await selectBank(page, renew.home)
  for (const path of [renew.about, renew.practice, renew.chapter, renew.wrong]) {
    await page.goto(path)
    await expect(page.getByRole('navigation', { name: '主要導覽' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
})
