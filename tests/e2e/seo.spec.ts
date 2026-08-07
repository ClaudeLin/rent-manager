import { expect, test } from '@playwright/test'

const origin = 'https://cert.muchengtech.com'
const indexableRoutes = [
  { path: '/', canonical: `${origin}/`, title: '租賃住宅管理人員題庫練習｜初訓與換證' },
  { path: '/init/', canonical: `${origin}/init/`, title: '初訓題庫｜租賃住宅管理人員題庫練習' },
  { path: '/renew/', canonical: `${origin}/renew/`, title: '換證題庫｜租賃住宅管理人員題庫練習' },
  { path: '/about/', canonical: `${origin}/about/`, title: '關於本站｜租賃住宅管理人員題庫練習' },
]
const statefulRoutes = [
  '/init/practice/',
  '/init/practice/chapter/',
  '/init/mock/',
  '/init/wrong/',
  '/renew/practice/',
  '/renew/practice/chapter/',
  '/renew/wrong/',
]
const statefulTitles = new Map([
  ['/init/practice/', '初訓全題練習｜租賃住宅管理人員題庫練習'],
  ['/init/practice/chapter/', '初訓章節練習｜租賃住宅管理人員題庫練習'],
  ['/init/mock/', '初訓模擬考｜租賃住宅管理人員題庫練習'],
  ['/init/wrong/', '初訓錯題回顧｜租賃住宅管理人員題庫練習'],
  ['/renew/practice/', '換證全題練習｜租賃住宅管理人員題庫練習'],
  ['/renew/practice/chapter/', '換證章節練習｜租賃住宅管理人員題庫練習'],
  ['/renew/wrong/', '換證錯題回顧｜租賃住宅管理人員題庫練習'],
])

function desktopOnly(testInfo: import('@playwright/test').TestInfo): void {
  test.skip(testInfo.project.name !== 'desktop', 'SEO contract only needs one browser profile')
}

test('robots.txt allows public pages, protects non-page endpoints, and advertises the sitemap', async ({ request }, testInfo) => {
  desktopOnly(testInfo)
  const response = await request.get('/robots.txt')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('text/plain')
  const body = (await response.text()).trim()
  expect(body.split(/\r?\n/)).toEqual([
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /data/',
    `Sitemap: ${origin}/sitemap.xml`,
  ])
  for (const route of statefulRoutes) expect(body).not.toContain(`Disallow: ${route}`)
})

test('sitemap exposes only durable indexable entry pages', async ({ request }, testInfo) => {
  desktopOnly(testInfo)
  const response = await request.get('/sitemap.xml')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toMatch(/xml/)
  const body = await response.text()
  const locations = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1])
  expect(locations).toEqual(indexableRoutes.map((route) => route.canonical))
  expect(body).not.toContain('/api/')
  expect(body).not.toContain('/data/')
  expect(body).not.toContain('/practice/')
  expect(body).not.toContain('/mock/')
  expect(body).not.toContain('/wrong/')
})

test('indexable entry pages publish consistent canonical and social metadata', async ({ page }, testInfo) => {
  desktopOnly(testInfo)
  for (const route of indexableRoutes) {
    await page.goto(route.path)
    const title = await page.title()
    const description = await page.locator('meta[name="description"]').getAttribute('content')
    expect(description).toBeTruthy()
    expect(title).toBe(route.title)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', route.canonical)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1')
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'website')
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', 'zh_TW')
    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute('content', '租賃住宅管理人員題庫練習')
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', title)
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', description!)
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', route.canonical)
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', `${origin}/og-image.png`)
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image')
    await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute('content', title)
    await expect(page.locator('meta[name="twitter:description"]')).toHaveAttribute('content', description!)
    await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute('content', `${origin}/og-image.png`)
  }
})

test('stateful exam pages are crawlable for noindex directives but excluded from search results', async ({ page }, testInfo) => {
  desktopOnly(testInfo)
  await page.addInitScript(() => {
    localStorage.setItem('rent-exam-question-bank-v1', 'withLaw')
    localStorage.setItem('rent-exam-renew-question-bank-v1', 'withLaw')
  })
  for (const route of statefulRoutes) {
    await page.goto(route)
    expect(await page.title()).toBe(statefulTitles.get(route))
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${origin}${route}`)
  }
})

test('home page publishes valid WebSite structured data', async ({ page }, testInfo) => {
  desktopOnly(testInfo)
  await page.goto('/')
  const structuredData = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}')
  expect(structuredData).toMatchObject({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: '租賃住宅管理人員題庫練習',
    url: `${origin}/`,
    inLanguage: 'zh-Hant-TW',
    isAccessibleForFree: true,
  })
  expect(structuredData.publisher).toMatchObject({
    '@type': 'Organization',
    name: '沐承科技有限公司',
    url: 'https://muchengtech.com',
  })
})

test('custom 404 document is explicitly excluded from search results', async ({ request }, testInfo) => {
  desktopOnly(testInfo)
  const response = await request.get('/404.html')
  expect(response.status()).toBe(200)
  const body = await response.text()
  expect(body).toContain('<title>找不到頁面｜租賃住宅管理人員題庫練習</title>')
  expect(body).toContain('<meta name="robots" content="noindex,nofollow">')
  expect(body).toContain('找不到這個頁面')
})

test('legacy fallback documents use clear localized titles and canonical targets', async ({ request }, testInfo) => {
  desktopOnly(testInfo)
  const cases = [
    ['/practice/index.html', '初訓全題練習已移動｜租賃住宅管理人員題庫練習', `${origin}/init/practice/`],
    ['/practice/chapter/index.html', '初訓章節練習已移動｜租賃住宅管理人員題庫練習', `${origin}/init/practice/chapter/`],
    ['/mock/index.html', '初訓模擬考已移動｜租賃住宅管理人員題庫練習', `${origin}/init/mock/`],
    ['/wrong/index.html', '初訓錯題回顧已移動｜租賃住宅管理人員題庫練習', `${origin}/init/wrong/`],
  ]
  for (const [path, title, canonical] of cases) {
    const response = await request.get(path)
    expect(response.status()).toBe(200)
    const body = await response.text()
    expect(body).toContain(`<title>${title}</title>`)
    expect(body).toContain('<meta name="robots" content="noindex,follow">')
    expect(body).toContain(`<link rel="canonical" href="${canonical}">`)
  }
})

test('problem report dialog retains GitHub Issues as a public alternative', async ({ page }, testInfo) => {
  desktopOnly(testInfo)
  for (const route of ['/', '/about/']) {
    await page.goto(route)
    await page.locator('[data-report-open]').first().click()
    const dialog = page.locator('[data-report-dialog]')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('link', { name: 'GitHub Issues' })).toHaveAttribute(
      'href',
      'https://github.com/MuChengTechnology/rent-manager/issues/new',
    )
  }
})
