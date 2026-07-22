import { expect, test } from '@playwright/test'

const configuredPath = process.env.PUBLIC_APP_PATH || '/practice'
const appPath = `/${configuredPath.split('/').filter(Boolean).join('/')}/`
const withLawUrl = `${appPath}data/questions_with_law.json`
const withoutLawUrl = `${appPath}data/questions_without_law.json`

async function chooseQuestionBank(page: import('@playwright/test').Page, label: string, expectedUrl: string): Promise<void> {
  const bankRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/data/questions_')) bankRequests.push(new URL(request.url()).pathname)
  })
  await page.getByRole('button', { name: label }).click()
  await expect(page.getByText('Practice • Mock Exam • Review')).toBeVisible()
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

test('根路徑維持 404，頁面資源皆由設定的深層路徑載入', async ({ page, request }) => {
  expect((await request.get('/')).status()).toBe(404)
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
    await page.locator('[data-action="chapter-select"]').selectOption('1')
    await page.locator('[data-action="start-chapter-practice"]').click()

    await expect(page.getByText('第 1 章隨機練習').first()).toBeVisible()
    await expect(page.locator('[data-question-key]')).toBeVisible()
  })

  test('模擬考建立固定一百題並提示未答後交卷', async ({ page }) => {
    await page.locator('[data-action="start-mock"]').click()

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
