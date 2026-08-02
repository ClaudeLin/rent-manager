import { expect, test } from '@playwright/test'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const init = '/init/'
const renew = '/renew/'
const initPractice = '/init/practice/'
const initChapter = '/init/practice/chapter/'
const renewChapter = '/renew/practice/chapter/'
const initMock = '/init/mock/'
const renewWrong = '/renew/wrong/'

async function choose(page: import('@playwright/test').Page, track: string, bank = '有詳解題庫') {
  await page.goto(track)
  await page.getByRole('button', { name: bank }).click()
  await expect(page.locator('[data-question-key]')).toBeVisible()
}

async function nav(page: import('@playwright/test').Page) {
  const menu = page.locator('[data-action="toggle-mobile-menu"]')
  if (await menu.isVisible()) await menu.click()
}

test('根目錄以可存取連結選擇初訓或換證，所有入口具 PWA 與 favicon metadata', async ({ page, request }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '選擇練習題庫' })).toBeVisible()
  await expect(page.getByRole('link', { name: '初訓題庫' })).toHaveAttribute('href', init)
  await expect(page.getByRole('link', { name: '換證題庫' })).toHaveAttribute('href', renew)
  for (const path of ['/', init, renew, '/init/about/', '/renew/about/']) {
    await page.goto(path)
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.svg')
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest')
    await expect(page.locator('meta[name="description"]')).toHaveCount(1)
  }
  expect((await request.get('/favicon.svg')).ok()).toBe(true)
})

test('初訓保留 legacy 選擇、題庫載入、詳解、章節、錯題與模擬考行為', async ({ page }) => {
  const requests: string[] = []
  page.on('request', request => { if (request.url().includes('/data/')) requests.push(new URL(request.url()).pathname) })
  await page.goto(init)
  await expect(page.getByRole('button', { name: '有詳解題庫' })).toBeVisible()
  await page.getByRole('button', { name: '有詳解題庫' }).click()
  await expect(page).toHaveURL(initPractice)
  await expect.poll(() => requests.sort()).toEqual(['/data/question_annotations.json', '/data/questions_with_law.json'])
  await page.locator('[data-option]').first().click(); await page.locator('[data-action="check-practice"]').click()
  await expect(page.getByRole('button', { name: '查看詳解' })).toBeVisible()
  await page.getByRole('button', { name: '查看詳解' }).click(); await expect(page.locator('.explanation')).toBeVisible()
  await nav(page); await page.getByRole('link', { name: '章節練習' }).click()
  await expect(page).toHaveURL(initChapter)
  await page.locator('[data-action="chapter-select"]').selectOption('1')
  await expect(page.getByText('第 1 章隨機練習').first()).toBeVisible()
  await page.goto(initMock); await page.getByRole('button', { name: '開始模擬考' }).click()
  await expect(page.locator('[data-exam-index]')).toHaveCount(100)
  await page.getByRole('button', { name: '交卷' }).click(); await page.getByRole('button', { name: '確認交卷' }).click()
  await expect(page.getByRole('heading', { name: '模擬考成績' })).toBeVisible()
})

test('初訓只有答案題庫不顯示詳解，並支援 legacy sessionStorage migration', async ({ page }) => {
  await page.goto(init)
  await page.evaluate(() => sessionStorage.setItem('rent-exam-question-bank-v1', 'withoutLaw'))
  await page.goto(initPractice)
  await expect(page.locator('[data-question-key]')).toBeVisible()
  await page.locator('[data-option]').first().click(); await page.locator('[data-action="check-practice"]').click()
  await expect(page.locator('[data-action="toggle-explanation"]')).toHaveCount(0)
})

test('載入與註記失敗 fail closed 並可返回正確 track 入口', async ({ page }) => {
  await page.route('**/data/renew/questions_with_law.json', route => route.fulfill({ status: 503, body: 'no' }))
  await page.goto(renew); await page.getByRole('button', { name: '有詳解題庫' }).click()
  await expect(page.getByRole('alert')).toContainText('目前無法載入')
  await expect(page.getByRole('link', { name: '返回入口' })).toHaveAttribute('href', renew)
})

test('換證兩版本各載入 379 題，僅有詳解版本提供詳解', async ({ page }) => {
  for (const bank of ['有詳解題庫', '只有答案題庫']) {
    await choose(page, renew, bank)
    const count = await page.locator('[data-question-key]').count()
    expect(count).toBe(1)
    await page.locator('[data-option]').first().click(); await page.locator('[data-action="check-practice"]').click()
    await expect(page.locator('[data-action="toggle-explanation"]')).toHaveCount(bank === '有詳解題庫' ? 1 : 0)
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('rent-exam-renew-session-v1')!))
    expect(stored.questionKeys).toHaveLength(379)
  }
})

test('換證章節與錯題只呈現實際第 1 至 3 章，並可練習指定章節錯題', async ({ page }) => {
  await choose(page, renew)
  await page.goto(renewChapter)
  await expect(page.locator('[data-action="chapter-select"] option')).toHaveCount(4)
  await page.locator('[data-action="chapter-select"]').selectOption('3')
  await expect(page.getByText('第 3 章隨機練習').first()).toBeVisible()
  await page.evaluate(() => localStorage.setItem('rent-exam-renew-history-v1', JSON.stringify({ version: 2, answered: 2, correct: 1, wrongKeys: ['c2-s1-q1'], recordedExamIds: [], chapterStats: { '2': { answered: 2, correct: 1 } }, mockAttempts: [] })))
  await page.goto(renewWrong)
  await expect(page.locator('[data-wrong-chapter-summary]')).toHaveCount(3)
  await expect(page.locator('[data-wrong-chapter-summary="2"]')).toContainText('目前錯題 1 題')
  await page.locator('[data-wrong-chapter-summary="2"]').getByRole('button', { name: '練習第 2 章錯題' }).click()
  await expect(page.locator('[data-question-key]')).toHaveAttribute('data-question-key', /^c2-/)
})

test('換證 reload 恢復 session，初訓與換證 session/history 完全隔離且各自可續作/放棄', async ({ page }) => {
  await choose(page, init); const initKey = await page.locator('[data-question-key]').getAttribute('data-question-key')
  await choose(page, renew); const renewKey = await page.locator('[data-question-key]').getAttribute('data-question-key')
  await page.reload(); await expect(page.locator('[data-question-key]')).toHaveAttribute('data-question-key', renewKey!)
  await page.goto(init); await expect(page.getByRole('link', { name: '繼續上次練習' })).toBeVisible()
  await page.getByRole('link', { name: '繼續上次練習' }).click(); await expect(page.locator('[data-question-key]')).toHaveAttribute('data-question-key', initKey!)
  await page.goto(renew); await page.getByRole('button', { name: '放棄這次進度' }).click()
  await expect(page.getByRole('link', { name: '繼續上次練習' })).toHaveCount(0)
  await page.goto(init); await expect(page.getByRole('link', { name: '繼續上次練習' })).toBeVisible()
})

test('換證沒有模擬考連結或生成路由，舊 feature routes 轉向初訓', async ({ page }) => {
  await choose(page, renew); await nav(page)
  await expect(page.getByRole('link', { name: '模擬考' })).toHaveCount(0)
  expect(existsSync(resolve(process.cwd(), 'dist/renew/mock/index.html'))).toBe(false)
  for (const oldPath of ['/practice/', '/practice/chapter/', '/wrong/', '/mock/']) {
    await page.goto(oldPath); await expect(page).toHaveURL(init)
  }
})

test('About 說明雙軌資料、379 題、換證 mock deferred 與官方來源', async ({ page }) => {
  await page.goto('/renew/about/')
  await expect(page.getByText('2026-02-06 更新版，共 379 題')).toBeVisible()
  await expect(page.getByText('模擬考功能尚未提供')).toBeVisible()
  await expect(page.getByText('初訓與換證資料完全分開')).toBeVisible()
  await page.goto('/init/about/')
  await expect(page.getByText('第 1 至第 10 章各抽十題，共 100 題')).toBeVisible()
})

test('390x844 mobile navigation and controls retain 44px targets without horizontal overflow', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile')
  await choose(page, init); await nav(page)
  for (const link of await page.getByRole('navigation', { name: '主要導覽' }).getByRole('link').all()) {
    const box = await link.boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
