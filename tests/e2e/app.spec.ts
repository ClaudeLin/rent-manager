import { expect, test } from '@playwright/test'

const configuredPath = process.env.PUBLIC_APP_PATH || ''
const pathSegments = configuredPath.split('/').filter(Boolean)
const appPath = pathSegments.length ? `/${pathSegments.join('/')}/` : '/'
const basePath = appPath === '/' ? '' : appPath.replace(/\/$/, '')
const withLawUrl = `${appPath}data/questions_with_law.json`
const withoutLawUrl = `${appPath}data/questions_without_law.json`
const homePath = appPath
const practicePath = `${basePath}/practice/`
const chapterPath = `${basePath}/practice/chapter/`
const mockPath = `${basePath}/mock/`
const wrongPath = `${basePath}/wrong/`

async function openPrimaryNavigation(page: import('@playwright/test').Page): Promise<void> {
  const menu = page.getByRole('button', { name: '選單' })
  if (await menu.isVisible()) {
    await expect(page.getByRole('navigation', { name: '主要導覽' })).toBeHidden()
    await menu.click()
    await expect(menu).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('navigation', { name: '主要導覽' })).toBeVisible()
  }
}

async function selectBankAtEntry(page: import('@playwright/test').Page, label = '有詳解題庫'): Promise<void> {
  await page.goto(homePath)
  await page.getByRole('button', { name: label }).click()
  await expect(page).toHaveURL(practicePath)
  await expect(page.locator('[data-question-key]')).toBeVisible()
}

test('入口選擇題庫後進入全題練習，Header 可返回入口重新選擇', async ({ page }) => {
  await page.goto(homePath)
  await expect(page.getByRole('heading', { name: '選擇題庫' })).toBeVisible()
  await page.getByRole('button', { name: '有詳解題庫' }).click()

  await expect(page).toHaveURL(practicePath)
  await expect(page.getByRole('link', { name: '返回入口' })).toHaveAttribute('href', homePath)
  await openPrimaryNavigation(page)
  await expect(page.getByRole('link', { name: '更換題庫' })).toHaveAttribute('href', homePath)
  await expect(page.locator('.brand small')).toContainText('目前：有詳解題庫')

  await page.reload()
  await expect(page).toHaveURL(practicePath)
  await expect(page.locator('.brand small')).toContainText('目前：有詳解題庫')
  await expect(page.locator('[data-question-key]')).toBeVisible()

  await openPrimaryNavigation(page)
  await page.getByRole('link', { name: '更換題庫' }).click()
  await expect(page).toHaveURL(homePath)
  await expect(page.getByRole('heading', { name: '選擇題庫' })).toBeVisible()
})

test('章節練習使用獨立路由並在選章後顯示該章題目', async ({ page }) => {
  await selectBankAtEntry(page)
  await openPrimaryNavigation(page)
  await page.getByRole('link', { name: '章節練習' }).click()

  await expect(page).toHaveURL(chapterPath)
  await expect(page.getByRole('heading', { name: '章節練習' })).toBeVisible()
  await page.locator('[data-action="chapter-select"]').selectOption('1')
  await expect(page.getByText('第 1 章隨機練習').first()).toBeVisible()
  await expect(page.locator('[data-question-key]')).toBeVisible()
  await expect(page.locator('[data-action="start-chapter-practice"]')).toHaveCount(0)
  await expect(page.locator('.control-panel').getByRole('link', { name: '錯題回顧' })).toHaveCount(0)

  await expect(page.locator('[data-action="chapter-order"]')).toHaveValue('random')
  await page.locator('[data-action="chapter-order"]').selectOption('sequential')
  await expect(page.getByText('第 1 章依題號順序練習').first()).toBeVisible()
  await expect(page.locator('[data-question-key]')).toHaveAttribute('data-question-key', 'c1-s1-q1')
  await page.locator('[data-option]').first().click()
  await page.locator('[data-action="check-practice"]').click()
  await page.locator('[data-action="next-practice"]').click()
  await expect(page.locator('[data-question-key]')).toHaveAttribute('data-question-key', 'c1-s1-q2')
  await page.locator('[data-option]').first().click()
  await page.locator('[data-action="check-practice"]').click()
  await page.locator('[data-action="toggle-explanation"]').click()
  await expect(page.locator('.explanation')).toBeVisible()

  await page.locator('[data-action="chapter-select"]').selectOption('2')
  await expect(page.getByText('第 2 章依題號順序練習').first()).toBeVisible()
  await expect(page.locator('[data-question-key]')).toHaveAttribute('data-question-key', 'c2-s1-q1')
  await expect(page.getByText(/第 1 \/ \d+ 題/).first()).toBeVisible()
  await expect(page.locator('.option.is-selected')).toHaveCount(0)
  await expect(page.locator('[data-action="check-practice"]')).toBeDisabled()
  await expect(page.locator('.explanation')).toHaveCount(0)
})

test('模擬考使用獨立路由且交卷後可返回練習首頁', async ({ page }) => {
  await selectBankAtEntry(page)
  await openPrimaryNavigation(page)
  await page.getByRole('link', { name: '模擬考' }).click()

  await expect(page).toHaveURL(mockPath)
  await expect(page.getByRole('heading', { name: '120 分鐘模擬考' })).toBeVisible()
  await page.getByRole('button', { name: '開始模擬考' }).click()
  await expect(page.getByText('第 1 / 100 題')).toBeVisible()
  await page.getByRole('button', { name: '交卷' }).click()
  await page.getByRole('button', { name: '確認交卷' }).click()
  await expect(page.getByRole('heading', { name: '模擬考成績' })).toBeVisible()

  await page.getByRole('link', { name: '返回練習首頁' }).click()
  await expect(page).toHaveURL(practicePath)
  await expect(page.locator('[data-question-key]')).toBeVisible()
})

test('錯題回顧使用獨立路由並可啟動錯題練習', async ({ page }) => {
  await selectBankAtEntry(page)
  await page.evaluate(() => localStorage.setItem('rent-exam-history-v1', JSON.stringify({
    answered: 3,
    correct: 2,
    wrongKeys: ['c1-s1-q1'],
  })))
  await openPrimaryNavigation(page)
  await page.getByRole('navigation', { name: '主要導覽' }).getByRole('link', { name: '錯題回顧' }).click()

  await expect(page).toHaveURL(wrongPath)
  await expect(page.getByRole('heading', { name: '錯題回顧' })).toBeVisible()
  await expect(page.getByText('錯題數：1')).toBeVisible()
  await page.getByRole('button', { name: '只練錯題' }).click()
  await expect(page.getByText('錯題練習').first()).toBeVisible()
  await expect(page.locator('[data-question-key]')).toBeVisible()
})

async function chooseQuestionBank(page: import('@playwright/test').Page, label: string, expectedUrl: string): Promise<void> {
  const bankRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/data/questions_')) bankRequests.push(new URL(request.url()).pathname)
  })
  await page.getByRole('button', { name: label }).click()
  await expect(page.getByRole('link', { name: '返回入口' })).toBeVisible()
  await expect(page.locator('[data-question-key]')).toBeVisible()
  await expect.poll(() => bankRequests).toEqual([expectedUrl])
}

test('首次進入先選擇題庫，不會自動載入 JSON', async ({ page }) => {
  const bankRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/data/questions_')) bankRequests.push(new URL(request.url()).pathname)
  })

  await page.goto(appPath)

  await expect(page.getByRole('heading', { name: '選擇題庫' })).toBeVisible()
  await expect(page.getByRole('button', { name: '有詳解題庫' })).toBeVisible()
  await expect(page.getByRole('button', { name: '只有答案題庫' })).toBeVisible()
  await expect(page.getByRole('button', { name: '有詳解題庫' })).toHaveCSS('min-height', '52px')
  await expect(page.getByRole('button', { name: '只有答案題庫' })).toHaveCSS('min-height', '52px')
  expect(bankRequests).toEqual([])
})

test('入口顯示官方題庫來源與更新日期', async ({ page }) => {
  await page.goto(appPath)

  const source = page.getByRole('link', { name: '新北市租賃住宅服務商業同業公會' })
  await expect(source).toHaveAttribute('href', 'https://www.ntrhm888.org.tw/service/news_view/9674.html')
  await expect(source).toHaveAttribute('target', '_blank')
  await expect(source).toHaveAttribute('rel', 'noopener noreferrer')
  await expect(page.getByText('題庫最後更新／轉檔日期：2026/7/21')).toBeVisible()
})

test('本機根路徑或部署 Base 行為正確，頁面資源皆由目前 Base 載入', async ({ page, request }) => {
  expect((await request.get('/')).status()).toBe(appPath === '/' ? 200 : 404)
  await page.goto(appPath)

  const resourcePaths = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => new URL(entry.name).pathname))
  expect(resourcePaths.length).toBeGreaterThan(0)
  expect(resourcePaths.every((path) => path.startsWith(appPath))).toBe(true)
})

test('選擇有詳解題庫後只載入對應 JSON', async ({ page }) => {
  await page.goto(appPath)
  await chooseQuestionBank(page, '有詳解題庫', withLawUrl)
})

test('題庫載入失敗後可回到選擇畫面', async ({ page }) => {
  await page.route(`**${withLawUrl}`, (route) => route.fulfill({ status: 503, body: '暫時無法使用' }))
  await page.goto(appPath)
  await page.getByRole('button', { name: '有詳解題庫' }).click()

  await expect(page.getByRole('alert')).toContainText('有詳解題庫目前無法載入')
  await page.getByRole('link', { name: '返回入口' }).click()
  await expect(page.getByRole('heading', { name: '選擇題庫' })).toBeVisible()
  await expect(page.getByRole('button', { name: '只有答案題庫' })).toBeVisible()
})

test('只有答案題庫檢查答案後不提供詳解按鈕', async ({ page }) => {
  await page.goto(appPath)
  await chooseQuestionBank(page, '只有答案題庫', withoutLawUrl)

  await page.locator('[data-option]').first().click()
  await page.locator('[data-action="check-practice"]').click()

  await expect(page.getByText(/正確答案：[A-D]/)).toBeVisible()
  await expect(page.locator('[data-action="toggle-explanation"]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /查看詳解|收合詳解/ })).toHaveCount(0)
})

test.describe('選擇有詳解題庫後的練習功能', () => {
  test.beforeEach(async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.on('pageerror', (error) => consoleErrors.push(error.message))
    await page.goto(appPath)
    await chooseQuestionBank(page, '有詳解題庫', withLawUrl)
    expect(consoleErrors).toEqual([])
  })

  test('全題庫隨機練習先檢查答案，再由使用者展開詳解', async ({ page }) => {
    await expect(page.getByText('全題庫隨機練習').first()).toBeVisible()
    await page.locator('[data-option]').first().click()
    const checkButton = page.locator('[data-action="check-practice"]')
    await checkButton.scrollIntoViewIfNeeded()
    await checkButton.click()

    await expect(page.getByText(/正確答案：[A-D]/)).toBeVisible()
    await expect(page.locator('.explanation')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '查看詳解' })).toBeVisible()
    await page.locator('[data-action="toggle-explanation"]').click()
    await expect(page.locator('.explanation')).toBeVisible()
    await page.locator('[data-action="toggle-explanation"]').click()
    await expect(page.locator('.explanation')).toHaveCount(0)
  })

  test('可選擇章節開始該章隨機練習', async ({ page }) => {
    await openPrimaryNavigation(page)
    await page.getByRole('link', { name: '章節練習' }).click()
    await expect(page).toHaveURL(chapterPath)
    await page.locator('[data-action="chapter-select"]').selectOption('1')

    await expect(page.getByText('第 1 章隨機練習').first()).toBeVisible()
    await expect(page.locator('[data-question-key]')).toBeVisible()
  })

  test('模擬考建立固定一百題並提示未答後交卷', async ({ page }) => {
    await openPrimaryNavigation(page)
    await page.getByRole('link', { name: '模擬考' }).click()
    await expect(page).toHaveURL(mockPath)
    await page.getByRole('button', { name: '開始模擬考' }).click()

    await expect(page.getByText('第 1 / 100 題')).toBeVisible()
    await expect(page.locator('[data-exam-index]')).toHaveCount(100)
    await expect(page.locator('[data-timer]')).toContainText('120:')

    await page.locator('[data-action="submit-mock"]').click()
    await expect(page.getByText('尚有 100 題未作答')).toBeVisible()
    await page.locator('[data-action="confirm-submit-mock"]').click()
    await expect(page.getByRole('heading', { name: '模擬考成績' })).toBeVisible()
    await expect(page.getByText('第 1 章：')).toBeVisible()
    await expect(page.locator('.explanation')).toHaveCount(0)
  })
})
