import { expect, test } from '@playwright/test'

const homePath = '/'
const practicePath = '/practice/'
const chapterPath = '/practice/chapter/'
const mockPath = '/mock/'
const wrongPath = '/wrong/'
const aboutPath = '/about/'
const withLawUrl = '/data/questions_with_law.json'
const withoutLawUrl = '/data/questions_without_law.json'
const annotationsUrl = '/data/question_annotations.json'

async function openPrimaryNavigation(page: import('@playwright/test').Page): Promise<void> {
  const menu = page.locator('[data-action="toggle-mobile-menu"]')
  if (await menu.isVisible()) {
    await expect(menu).toHaveAttribute('aria-label', '開啟選單')
    await expect(page.getByRole('navigation', { name: '主要導覽' })).toBeHidden()
    await menu.click()
    await expect(menu).toHaveAttribute('aria-expanded', 'true')
    await expect(menu).toHaveAttribute('aria-label', '關閉選單')
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
  await expect(page.locator('.brand-home')).toContainText('租賃住宅管理人員證照題庫練習')
  await expect(page.locator('.hamburger-line')).toHaveCount(3)
  await expect(page.getByRole('link', { name: '返回入口' })).toHaveAttribute('href', homePath)
  await openPrimaryNavigation(page)
  await expect(page.getByRole('link', { name: '更換題庫' })).toHaveAttribute('href', homePath)
  await expect(page.getByRole('link', { name: '關於本站' })).toHaveAttribute('href', aboutPath)
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

test('入口可繼續上次中斷練習，reload 保留檢查狀態且可放棄進度', async ({ page }) => {
  await page.goto(homePath)
  await expect(page.getByRole('button', { name: '繼續上次練習' })).toHaveCount(0)
  await page.getByRole('button', { name: '有詳解題庫' }).click()
  const key = await page.locator('[data-question-key]').getAttribute('data-question-key')
  await page.locator('[data-option="B"]').click()
  await page.locator('[data-action="check-practice"]').click()

  await page.reload()
  await expect(page.locator('[data-question-key]')).toHaveAttribute('data-question-key', key!)
  await expect(page.getByText('正確答案：')).toBeVisible()

  await page.goto(homePath)
  await expect(page.getByRole('button', { name: '繼續上次練習' })).toBeVisible()
  await expect(page.getByText('全題庫隨機練習')).toBeVisible()
  await expect(page.getByText(/第 1 \/ \d+ 題/)).toBeVisible()
  await page.getByRole('button', { name: '繼續上次練習' }).click()
  await expect(page).toHaveURL(practicePath)
  await expect(page.locator('[data-question-key]')).toHaveAttribute('data-question-key', key!)
  await expect(page.getByText('正確答案：')).toBeVisible()

  await page.goto(homePath)
  await page.getByRole('button', { name: '放棄這次進度' }).click()
  await expect(page.getByRole('button', { name: '繼續上次練習' })).toHaveCount(0)
})

test('入口遇到損壞的中斷資料時安全忽略', async ({ page }) => {
  await page.goto(homePath)
  await page.evaluate(() => localStorage.setItem('rent-exam-session-v1', '{broken'))
  await page.reload()

  await expect(page.getByRole('heading', { name: '選擇題庫' })).toBeVisible()
  await expect(page.getByRole('button', { name: '繼續上次練習' })).toHaveCount(0)
})

test('新版離線資料提示使用同步的三秒倒數進度條', async ({ page }) => {
  await page.goto(homePath)
  const notice = page.locator('[data-offline-notice]')
  await expect(notice).not.toHaveAttribute('data-state', 'preparing')
  await notice.evaluate((element) => {
    const toast = element as HTMLElement
    toast.hidden = false
    toast.dataset.state = 'updated'
    toast.style.setProperty('--offline-toast-duration', '3000ms')
    toast.classList.add('is-visible')
  })

  const progress = notice.locator('.offline-toast-progress')
  await expect(progress).toHaveCSS('animation-duration', '3s')
  await expect(progress).not.toHaveCSS('animation-name', 'none')
})

test('手機題目設定可收合，檢查答案後結果留在 viewport', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', '手機 UX 專屬驗證')
  await selectBankAtEntry(page)
  const toggle = page.locator('[data-action="toggle-settings"]')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(toggle).toHaveAttribute('aria-label', '展開練習設定')
  await expect(page.locator('#practice-settings')).toBeHidden()
  await expect(page.locator('.settings-summary')).toContainText('全題庫・隨機出題')

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('#practice-settings')).toBeVisible()
  await page.locator('[data-option="B"]').click()
  await page.locator('[data-action="check-practice"]').click()

  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('#practice-settings')).toBeHidden()
  const feedback = page.locator('[data-answer-feedback]')
  await expect(feedback).toBeVisible()
  const feedbackBox = await feedback.boundingBox()
  const viewport = page.viewportSize()!
  expect(feedbackBox).not.toBeNull()
  expect(feedbackBox!.y).toBeGreaterThanOrEqual(0)
  expect(feedbackBox!.y + feedbackBox!.height).toBeLessThanOrEqual(viewport.height)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('手機主要導覽與模擬考題號均有 44×44 點擊範圍', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', '手機 UX 專屬驗證')
  await selectBankAtEntry(page)
  await openPrimaryNavigation(page)
  for (const link of await page.getByRole('navigation', { name: '主要導覽' }).getByRole('link').all()) {
    const box = await link.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }

  await page.goto(mockPath)
  await page.getByRole('button', { name: '開始模擬考' }).click()
  for (const item of await page.locator('[data-exam-index]').all()) {
    const box = await item.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
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

  await page.locator('[data-action="toggle-settings"]').click()
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

  await page.locator('[data-action="toggle-settings"]').click()
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
  await expect(page.getByText('第 1 至第 10 章，每章各隨機抽取 10 題，共 100 題')).toBeVisible()
  await expect(page.getByText('每次開始模擬考都會重新抽題')).toBeVisible()
  await page.getByRole('button', { name: '開始模擬考' }).click()
  await expect(page.getByText('第 1 / 100 題')).toBeVisible()
  await page.getByRole('button', { name: '交卷' }).click()
  await page.getByRole('button', { name: '確認交卷' }).click()
  await expect(page.getByRole('heading', { name: '模擬考成績' })).toBeVisible()

  await page.getByRole('link', { name: '返回練習首頁' }).click()
  await expect(page).toHaveURL(practicePath)
  await expect(page.locator('[data-question-key]')).toBeVisible()
})

test('模擬考 reload 後保留題序、選項排列、目前題號、答案與原始倒數', async ({ page }) => {
  await selectBankAtEntry(page)
  await page.goto(mockPath)
  await page.getByRole('button', { name: '開始模擬考' }).click()
  const firstOptionTexts = await page.locator('[data-option] span').allTextContents()
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('rent-exam-session-v1')!))
  expect(Object.keys(stored.optionOrders)).toHaveLength(100)
  expect(stored.optionOrders[stored.questionKeys[0]]).toHaveLength(4)
  await page.locator('[data-option="B"]').click()
  await page.locator('[data-exam-index="49"]').click()
  await page.waitForTimeout(1_100)
  const timerBeforeReload = await page.locator('[data-timer]').textContent()

  await page.reload()

  await expect(page.getByText('第 50 / 100 題')).toBeVisible()
  await page.locator('[data-exam-index="0"]').click()
  await expect(page.locator('[data-option="B"]')).toHaveAttribute('aria-pressed', 'true')
  expect(await page.locator('[data-option] span').allTextContents()).toEqual(firstOptionTexts)
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('rent-exam-session-v1')!))
  expect(restored.optionOrders).toEqual(stored.optionOrders)
  const timerAfterReload = await page.locator('[data-timer]').textContent()
  expect(timerAfterReload).not.toBe('120:00')
  expect(timerAfterReload! <= timerBeforeReload!).toBe(true)
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
  await page.getByRole('button', { name: '練習全部錯題' }).click()
  await expect(page.getByText('錯題練習').first()).toBeVisible()
  await expect(page.locator('[data-question-key]')).toBeVisible()
})

test('錯題回顧顯示各章歷史比例並可練習指定章節錯題', async ({ page }) => {
  await selectBankAtEntry(page)
  await page.evaluate(() => localStorage.setItem('rent-exam-history-v1', JSON.stringify({
    version: 2,
    answered: 8,
    correct: 5,
    wrongKeys: ['c2-s1-q1', 'c2-s1-q2', 'c3-s1-q1'],
    recordedExamIds: [],
    chapterStats: { '2': { answered: 5, correct: 2 }, '3': { answered: 3, correct: 3 } },
    mockAttempts: [],
  })))
  await page.goto(wrongPath)

  const chapterTwo = page.locator('[data-wrong-chapter-summary="2"]')
  await expect(chapterTwo).toContainText('歷史答錯率 60%')
  await expect(chapterTwo).toContainText('目前錯題 2 題')
  await chapterTwo.getByRole('button', { name: '練習第 2 章錯題' }).click()
  await expect(page.getByText('第 2 章錯題練習').first()).toBeVisible()
  await expect(page.locator('[data-question-key]')).toHaveAttribute('data-question-key', /^c2-/)
  await expect(page.getByText('第 1 / 2 題')).toBeVisible()
})

test('模擬考頁顯示歷史章節分布並可單獨清除結果', async ({ page }) => {
  await selectBankAtEntry(page)
  await page.evaluate(() => {
    const chapters = Array.from({ length: 10 }, (_, index) => ({ chapter: index + 1, total: 10, answered: 10, correct: index === 1 ? 6 : 8 }))
    localStorage.setItem('rent-exam-history-v1', JSON.stringify({
      version: 2,
      answered: 200,
      correct: 158,
      wrongKeys: ['c2-s1-q1'],
      recordedExamIds: ['attempt-12345678', 'attempt-abcdefgh'],
      chapterStats: { '2': { answered: 20, correct: 14 } },
      mockAttempts: [
        { attemptId: 'attempt-12345678', completedAt: 1_000, bankKey: 'withLaw', correct: 78, total: 100, chapters },
        { attemptId: 'attempt-abcdefgh', completedAt: 2_000, bankKey: 'withLaw', correct: 80, total: 100, chapters: chapters.map((chapter) => ({ ...chapter, correct: 8 })) },
      ],
    }))
  })
  await page.goto(mockPath)

  await expect(page.getByRole('heading', { name: '歷史模擬考表現' })).toBeVisible()
  await expect(page.getByText('共 2 次模擬考')).toBeVisible()
  const chapterTwo = page.locator('.history-panel > .performance-grid .performance-card').filter({ hasText: '第 2 章' })
  await expect(chapterTwo).toContainText('14 / 20 題')
  await expect(chapterTwo).toContainText('70%')
  await expect(page.locator('.attempt-card')).toHaveCount(2)

  await page.getByRole('button', { name: '清除模擬考紀錄' }).click()
  await expect(page.getByText('確定清除所有模擬考結果分布？錯題與累計作答不受影響。')).toBeVisible()
  await page.getByRole('button', { name: '確認清除' }).click()
  await expect(page.getByText(/尚無模擬考紀錄/)).toBeVisible()
  const retained = await page.evaluate(() => JSON.parse(localStorage.getItem('rent-exam-history-v1')!))
  expect(retained.wrongKeys).toEqual(['c2-s1-q1'])
  expect(retained.answered).toBe(200)
})

test('舊版本機紀錄在更新後可直接使用且不發生頁面錯誤', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await selectBankAtEntry(page)
  await page.evaluate(() => localStorage.setItem('rent-exam-history-v1', JSON.stringify({
    answered: 3,
    correct: 2,
    wrongKeys: ['c1-s1-q1'],
  })))

  await page.goto(wrongPath)
  await expect(page.getByText('累計作答：3')).toBeVisible()
  await expect(page.getByText('錯題數：1')).toBeVisible()
  await expect(page.locator('[data-wrong-chapter-summary="1"]')).toContainText('目前錯題 1 題')

  await page.goto(mockPath)
  await expect(page.getByRole('heading', { name: '120 分鐘模擬考' })).toBeVisible()
  await expect(page.getByText(/尚無模擬考紀錄/)).toBeVisible()
  expect(errors).toEqual([])
})

async function chooseQuestionBank(page: import('@playwright/test').Page, label: string, expectedUrl: string): Promise<void> {
  const dataRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/data/')) dataRequests.push(new URL(request.url()).pathname)
  })
  await page.getByRole('button', { name: label }).click()
  await expect(page.getByRole('link', { name: '返回入口' })).toBeVisible()
  await expect(page.locator('[data-question-key]')).toBeVisible()
  await expect.poll(() => [...dataRequests].sort()).toEqual([annotationsUrl, expectedUrl].sort())
}

test('首次進入先選擇題庫，不會自動載入 JSON', async ({ page }) => {
  const dataRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/data/')) dataRequests.push(new URL(request.url()).pathname)
  })

  await page.goto(homePath)

  await expect(page.getByRole('heading', { name: '選擇題庫' })).toBeVisible()
  await expect(page.getByRole('button', { name: '有詳解題庫' })).toBeVisible()
  await expect(page.getByRole('button', { name: '只有答案題庫' })).toBeVisible()
  await expect(page.getByRole('button', { name: '有詳解題庫' })).toHaveCSS('min-height', '52px')
  await expect(page.getByRole('button', { name: '只有答案題庫' })).toHaveCSS('min-height', '52px')
  expect(dataRequests).toEqual([])
})

test('入口顯示來源摘要、練習用途聲明與 About 入口', async ({ page }) => {
  await page.goto(homePath)

  const source = page.getByRole('link', { name: '中華民國租賃住宅服務商業同業公會全國聯合會' })
  await expect(source).toHaveAttribute('href', 'https://rentalh.org.tw/down-list2.php?lmenuid=12&mpmid=2')
  await expect(source).toHaveAttribute('target', '_blank')
  await expect(source).toHaveAttribute('rel', 'noopener noreferrer')
  await expect(page.getByText('題庫最後更新／轉檔日期：2026/7/21')).toBeVisible()
  await expect(page.getByText('本題庫僅供學習與練習使用，內容請以官方最新公告為準。')).toBeVisible()
  await expect(page.getByRole('link', { name: '查看完整資料來源、模擬考規則與免責聲明' })).toHaveAttribute('href', aboutPath)
})

test('About 集中顯示資料來源、免責聲明與模擬考規則', async ({ page }) => {
  await page.goto(aboutPath)

  await expect(page.getByRole('heading', { name: '關於本題庫' })).toBeVisible()
  await expect(page.getByRole('link', { name: '中華民國租賃住宅服務商業同業公會全國聯合會' })).toHaveAttribute('href', 'https://rentalh.org.tw/down-list2.php?lmenuid=12&mpmid=2')
  await expect(page.getByText('題庫最後更新／轉檔日期：2026/7/21')).toBeVisible()
  await expect(page.getByText('本網站僅供個人學習與測驗練習使用')).toBeVisible()
  await expect(page.getByText('不得作為法律意見或專業服務之替代')).toBeVisible()
  await expect(page.getByText('第 1 至第 10 章，每章各隨機抽取 10 題，共 100 題')).toBeVisible()
  await expect(page.getByText('經實際課程註記為「可忽略」的題目，不納入模擬考抽題。')).toBeVisible()
  await expect(page.getByText('每次開始模擬考都會重新抽題')).toBeVisible()
  await expect(page.getByText('作答時間為 120 分鐘')).toBeVisible()

  const githubReport = page.getByRole('link', { name: '前往 GitHub Issues 回報' })
  await expect(githubReport).toHaveAttribute('href', 'https://github.com/MuChengTechnology/rent-manager/issues/new')
  await expect(githubReport).toHaveAttribute('target', '_blank')
  await expect(githubReport).toHaveAttribute('rel', 'noopener noreferrer')

  const emailReport = page.getByRole('link', { name: 'Email 回報' })
  await expect(emailReport).toHaveAttribute(
    'href',
    'mailto:issue.report+rentmanager@muchengtech.com?subject=%E7%A7%9F%E8%B3%83%E9%A1%8C%E5%BA%AB%E5%95%8F%E9%A1%8C%E5%9B%9E%E5%A0%B1%E8%88%87%E5%BB%BA%E8%AD%B0',
  )
  await expect(page.getByText('issue.report+rentmanager@muchengtech.com')).toHaveCount(0)
})

test('所有頁面使用同一個根目錄 favicon', async ({ page, request }) => {
  await page.goto(homePath)
  await page.evaluate(() => sessionStorage.setItem('rent-exam-question-bank-v1', 'withLaw'))

  for (const path of [homePath, practicePath, chapterPath, mockPath, wrongPath, aboutPath]) {
    await page.goto(path)
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.svg')
  }

  const favicon = await request.get('/favicon.svg')
  expect(favicon.ok()).toBe(true)
  expect(favicon.headers()['content-type']).toContain('image/svg+xml')
})

test('網站固定由根目錄提供入口與靜態資源', async ({ page, request }) => {
  expect((await request.get('/')).status()).toBe(200)
  await page.goto(homePath)

  const resourcePaths = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => new URL(entry.name).pathname))
  expect(resourcePaths.length).toBeGreaterThan(0)
  expect(resourcePaths.every((path) => path.startsWith('/'))).toBe(true)
})

test('Service Worker precache 包含共用題目註記', async ({ request }) => {
  const response = await request.get('/sw.js')
  expect(response.ok()).toBe(true)
  expect(await response.text()).toContain('question_annotations.json')
})

test('選擇有詳解題庫後只載入對應 JSON', async ({ page }) => {
  await page.goto(homePath)
  await chooseQuestionBank(page, '有詳解題庫', withLawUrl)
})

test('題庫載入失敗後可回到選擇畫面', async ({ page }) => {
  await page.route(`**${withLawUrl}`, (route) => route.fulfill({ status: 503, body: '暫時無法使用' }))
  await page.goto(homePath)
  await page.getByRole('button', { name: '有詳解題庫' }).click()

  await expect(page.getByRole('alert')).toContainText('有詳解題庫目前無法載入')
  await page.getByRole('link', { name: '返回入口' }).click()
  await expect(page.getByRole('heading', { name: '選擇題庫' })).toBeVisible()
  await expect(page.getByRole('button', { name: '只有答案題庫' })).toBeVisible()
})

test('題目註記載入失敗時 fail closed', async ({ page }) => {
  await page.route(`**${annotationsUrl}`, (route) => route.fulfill({ status: 503, body: '暫時無法使用' }))
  await page.goto(homePath)
  await page.getByRole('button', { name: '有詳解題庫' }).click()

  await expect(page.getByRole('alert')).toContainText('目前無法載入')
  await expect(page.locator('[data-question-key]')).toHaveCount(0)
})

test('章節練習標示可忽略題並以括號補充錯字', async ({ page }) => {
  await selectBankAtEntry(page)
  await page.goto(chapterPath)
  await page.locator('[data-action="chapter-select"]').selectOption('2')
  await page.locator('[data-action="toggle-settings"]').click()
  await page.locator('[data-action="chapter-order"]').selectOption('sequential')

  for (let index = 1; index < 5; index += 1) {
    await page.locator('[data-option]').first().click()
    await page.locator('[data-action="check-practice"]').click()
    await page.locator('[data-action="next-practice"]').click()
  }
  await expect(page.locator('[data-question-key]')).toHaveAttribute('data-question-key', 'c2-s1-q5')
  await expect(page.locator('[data-annotation-type="ignore"]')).toContainText('此題可忽略')

  for (let index = 5; index < 17; index += 1) {
    await page.locator('[data-option]').first().click()
    await page.locator('[data-action="check-practice"]').click()
    await page.locator('[data-action="next-practice"]').click()
  }
  await expect(page.locator('[data-question-key]')).toHaveAttribute('data-question-key', 'c2-s1-q17')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('並為（未）約定')
  await expect(page.locator('[data-annotation-type="typo"]')).toContainText('考試仍可能沿用原文')
})

test('模擬考 session 不包含可忽略題', async ({ page }) => {
  await selectBankAtEntry(page)
  await page.goto(mockPath)
  await page.getByRole('button', { name: '開始模擬考' }).click()

  const keys = await page.evaluate(() => JSON.parse(localStorage.getItem('rent-exam-session-v1')!).questionKeys as string[])
  expect(keys).toHaveLength(100)
  expect(keys).not.toContain('c2-s1-q5')
  expect(keys).not.toContain('c2-s1-q23')
})

test('只有答案題庫檢查答案後不提供詳解按鈕', async ({ page }) => {
  await page.goto(homePath)
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
    await page.goto(homePath)
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
