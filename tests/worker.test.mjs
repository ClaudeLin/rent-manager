import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handleRequest } from '../src/worker.mjs';

const origin = 'https://example.invalid';
const validBody = {
  issueType: 'question',
  track: 'init',
  bank: 'withLaw',
  questionContext: 'chapter',
  chapter: '2',
  questionNumber: '23',
  questionId: 'c2-s1-q17',
  reporterName: '王小明',
  reporterEmail: 'learner+reply@example.com',
  description: '題目內容與官方資料不一致，請協助確認。',
  attachment: null,
  pagePath: '/init/practice/',
  deviceSummary: '',
  privacyConfirmed: 'on',
  company: '',
  turnstileToken: 'valid-token',
};
const requestFor = (body = validBody, requestOrigin = origin) => new Request(`${requestOrigin}/api/forms/issue-report`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: requestOrigin, 'cf-connecting-ip': '203.0.113.10' },
  body: JSON.stringify(body),
});
const turnstileFor = (action = 'issue-report', hostname = 'example.invalid') => async () => new Response(
  JSON.stringify({ success: true, action, hostname }),
  { headers: { 'content-type': 'application/json' } },
);
const environment = (overrides = {}) => ({
  ASSETS: { fetch: async () => new Response('asset') },
  REPORT_EMAIL: { send: async () => undefined },
  REPORT_MAIL: 'reports@example.invalid',
  FORM_SENDER: 'sender@example.invalid',
  FORM_ALLOWED_ORIGIN: origin,
  TURNSTILE_SECRET_KEY: 'test-secret',
  ...overrides,
});

test('Wrangler 版本化 Worker 入口與 API routing，且不重新加入 Rate Limit binding', async () => {
  const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.equal(config.main, './src/worker.mjs');
  assert.equal(config.assets.binding, 'ASSETS');
  assert.deepEqual(config.assets.run_worker_first, [
    '/api/*',
    '/practice',
    '/practice/',
    '/practice/chapter',
    '/practice/chapter/',
    '/mock',
    '/mock/',
    '/wrong',
    '/wrong/',
  ]);
  assert.equal(config.assets.not_found_handling, '404-page');
  assert.equal(config.ratelimits, undefined);
});

test('舊版練習路由的 GET 與 HEAD 都回永久 redirect 並保留 query，不交給 static assets', async () => {
  const cases = [
    ['/practice', '/init/practice/'],
    ['/practice/', '/init/practice/'],
    ['/practice/chapter', '/init/practice/chapter/'],
    ['/practice/chapter/', '/init/practice/chapter/'],
    ['/mock', '/init/mock/'],
    ['/mock/', '/init/mock/'],
    ['/wrong', '/init/wrong/'],
    ['/wrong/', '/init/wrong/'],
  ];
  for (const method of ['GET', 'HEAD']) {
    for (const [path, target] of cases) {
      let assetFetches = 0;
      const response = await handleRequest(
        new Request(`${origin}${path}?from=legacy`, { method }),
        environment({ ASSETS: { fetch: async () => { assetFetches += 1; return new Response('asset'); } } }),
      );
      assert.equal(response.status, 301, `${method} ${path}`);
      assert.equal(response.headers.get('location'), `${origin}${target}?from=legacy`, `${method} ${path}`);
      assert.equal(response.headers.get('cache-control'), 'public, max-age=86400', `${method} ${path}`);
      assert.equal(assetFetches, 0, `${method} ${path}`);
    }
  }
});

test('合法回報從 REPORT_MAIL 與 FORM_SENDER 讀取收寄件者，回報者 Email 只作 Reply-To', async () => {
  const sent = [];
  const response = await handleRequest(
    requestFor(),
    environment({ REPORT_EMAIL: { send: async (message) => sent.push(message) } }),
    { fetch: turnstileFor() },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'reports@example.invalid');
  assert.equal(sent[0].from, 'sender@example.invalid');
  assert.equal(sent[0].replyTo, 'learner+reply@example.com');
  assert.equal(sent[0].subject, '【題庫問題回報｜初訓・題目錯誤】王小明・learner+reply・第23題');
  assert.match(sent[0].text, /頁面：\/init\/practice\//);
  assert.match(sent[0].text, /題目出現於：章節練習/);
  assert.match(sent[0].text, /目前顯示題次：第 23 題/);
  assert.match(sent[0].text, /系統題目識別碼：c2-s1-q17/);
  assert.match(sent[0].text, /回報人：王小明/);
  assert.doesNotMatch(sent[0].text, /turnstileToken/);
});

test('FORM_ALLOWED_ORIGIN 以逗號分隔兩個精確 origin，兩者各自驗證對應 Turnstile hostname', async () => {
  const origins = ['https://cert.muchengtech.com', 'https://rent-cert.muchengtech.com'];
  for (const requestOrigin of origins) {
    const sent = [];
    const response = await handleRequest(
      requestFor(validBody, requestOrigin),
      environment({
        FORM_ALLOWED_ORIGIN: origins.join(','),
        REPORT_EMAIL: { send: async (message) => sent.push(message) },
      }),
      { fetch: turnstileFor('issue-report', new URL(requestOrigin).hostname) },
    );
    assert.equal(response.status, 200, requestOrigin);
    assert.equal(sent.length, 1, requestOrigin);
  }
});

test('origin allowlist 接受最多 10 個精確 origin', async () => {
  const origins = Array.from({ length: 10 }, (_, index) => `https://site-${index}.example.invalid`);
  const response = await handleRequest(
    requestFor(validBody, origins[9]),
    environment({ FORM_ALLOWED_ORIGIN: origins.join(',') }),
    { fetch: turnstileFor('issue-report', 'site-9.example.invalid') },
  );
  assert.equal(response.status, 200);
});

test('回報者 Email 只用於 Reply-To，前端偽造收寄件者會被忽略', async () => {
  const sent = [];
  const body = { ...validBody, reporterEmail: 'other+reply@example.com', to: 'attacker@example.com', from: 'spoof@example.com' };
  const response = await handleRequest(
    requestFor(body),
    environment({ REPORT_EMAIL: { send: async (message) => sent.push(message) } }),
    { fetch: turnstileFor() },
  );
  assert.equal(response.status, 200);
  assert.equal(sent[0].to, 'reports@example.invalid');
  assert.equal(sent[0].from, 'sender@example.invalid');
  assert.equal(sent[0].replyTo, 'other+reply@example.com');
});

test('Email 語法接受 ASCII dot-atom 與 254 字元邊界', async () => {
  const domain252 = `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(60)}`;
  const emails = [
    'learner+reply@example.com',
    `${'a'.repeat(64)}@example.com`,
    `a@${'b'.repeat(63)}.com`,
    `a@${domain252}`,
  ];
  for (const email of emails) {
    const sent = [];
    const response = await handleRequest(
      requestFor({ ...validBody, reporterEmail: email }),
      environment({ REPORT_EMAIL: { send: async (message) => sent.push(message) } }),
      { fetch: turnstileFor() },
    );
    assert.equal(response.status, 200, email);
    assert.equal(sent[0].replyTo, email);
  }
});

test('無效 Email 與欄位在驗證前拒絕且零寄件', async () => {
  const invalidEmails = [
    'bad@email', ' name@example.com', 'name@example.com ', 'name@@example.com',
    'name..dot@example.com', '.name@example.com', 'name.@example.com',
    `${'a'.repeat(65)}@example.com`, `a@${'b'.repeat(64)}.com`,
    `a@${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`,
  ];
  const cases = [
    ...invalidEmails.map((reporterEmail) => [{ ...validBody, reporterEmail }, 'invalid_email']),
    [{ ...validBody, reporterName: '' }, 'invalid_fields'],
    [{ ...validBody, track: '' }, 'invalid_fields'],
    [{ ...validBody, reporterEmail: undefined }, 'invalid_email'],
    [{ ...validBody, privacyConfirmed: undefined }, 'invalid_fields'],
    [{ ...validBody, pagePath: '/init/practice/?token=secret' }, 'invalid_fields'],
    [{ ...validBody, description: '太短' }, 'invalid_fields'],
    [{ ...validBody, questionContext: 'constructor' }, 'invalid_fields'],
    [{ ...validBody, questionNumber: '第23題' }, 'invalid_fields'],
    [{ ...validBody, questionNumber: '0' }, 'invalid_fields'],
  ];
  for (const [body, error] of cases) {
    let fetches = 0;
    let sends = 0;
    const response = await handleRequest(
      requestFor(body),
      environment({ REPORT_EMAIL: { send: async () => { sends += 1; } } }),
      { fetch: async () => { fetches += 1; return turnstileFor()(); } },
    );
    assert.equal(response.status, 422, String(body.reporterEmail));
    assert.deepEqual(await response.json(), { ok: false, error });
    assert.equal(fetches, 0);
    assert.equal(sends, 0);
  }
});

test('honeypot 命中時假成功但不驗證 Turnstile、不寄信', async () => {
  let fetches = 0;
  let sends = 0;
  const response = await handleRequest(
    requestFor({ ...validBody, company: 'spam company' }),
    environment({ REPORT_EMAIL: { send: async () => { sends += 1; } } }),
    { fetch: async () => { fetches += 1; return turnstileFor()(); } },
  );
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(fetches, 0);
  assert.equal(sends, 0);
});

test('Turnstile 必須符合 issue-report action 與設定來源 hostname', async () => {
  for (const verify of [
    turnstileFor('contact'),
    turnstileFor('issue-report', 'evil.invalid'),
    async () => new Response(JSON.stringify({ success: false })),
  ]) {
    let sends = 0;
    const response = await handleRequest(
      requestFor(),
      environment({ REPORT_EMAIL: { send: async () => { sends += 1; } } }),
      { fetch: verify },
    );
    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), { ok: false, error: 'verification_failed' });
    assert.equal(sends, 0);
  }
});

test('即使 hostname 在 allowlist 中，也不能拿另一個 origin 的 Turnstile 結果送出', async () => {
  let sends = 0;
  const response = await handleRequest(
    requestFor(),
    environment({
      FORM_ALLOWED_ORIGIN: `${origin},https://rent-cert.muchengtech.com`,
      REPORT_EMAIL: { send: async () => { sends += 1; } },
    }),
    { fetch: turnstileFor('issue-report', 'rent-cert.muchengtech.com') },
  );
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), { ok: false, error: 'verification_failed' });
  assert.equal(sends, 0);
});

test('跨來源、錯誤 content type 與超大 payload 在 Worker 邊界拒絕', async () => {
  const forbidden = await handleRequest(requestFor(validBody, 'https://evil.invalid'), environment(), { fetch: turnstileFor() });
  assert.equal(forbidden.status, 403);
  const wrongType = new Request(`${origin}/api/forms/issue-report`, {
    method: 'POST', headers: { origin, 'content-type': 'text/plain' }, body: '{}',
  });
  assert.equal((await handleRequest(wrongType, environment())).status, 415);
  const huge = requestFor({ ...validBody, description: 'x'.repeat(1_500_001) });
  assert.equal((await handleRequest(huge, environment())).status, 413);
});

test('缺少任一必要設定時 fail closed，且不驗證 Turnstile、不寄信', async () => {
  for (const key of ['REPORT_EMAIL', 'REPORT_MAIL', 'FORM_SENDER', 'FORM_ALLOWED_ORIGIN', 'TURNSTILE_SECRET_KEY']) {
    let fetches = 0;
    let sends = 0;
    const unavailable = await handleRequest(requestFor(), environment({
      [key]: undefined,
      REPORT_EMAIL: key === 'REPORT_EMAIL' ? undefined : { send: async () => { sends += 1; } },
    }), { fetch: async () => { fetches += 1; return turnstileFor()(); } });
    assert.equal(unavailable.status, 503, key);
    assert.deepEqual(await unavailable.json(), { ok: false, error: 'service_unavailable' }, key);
    assert.equal(fetches, 0, key);
    assert.equal(sends, 0, key);
  }
});

test('設定中的 sender、report mail 或 origin 格式不合法時 fail closed', async () => {
  for (const overrides of [
    { REPORT_MAIL: 'bad@email' },
    { FORM_SENDER: 'bad@email' },
    { FORM_ALLOWED_ORIGIN: 'not-a-url' },
    { FORM_ALLOWED_ORIGIN: 'https://example.invalid/path' },
    { FORM_ALLOWED_ORIGIN: 'https://example.invalid/' },
    { FORM_ALLOWED_ORIGIN: 'https://example.invalid\u0000' },
    { FORM_ALLOWED_ORIGIN: 'https://example.invalid,' },
    { FORM_ALLOWED_ORIGIN: 'https://*.muchengtech.com' },
    { FORM_ALLOWED_ORIGIN: 'https://example.invalid,https://example.invalid' },
    { FORM_ALLOWED_ORIGIN: 'https://user:password@example.invalid' },
    { FORM_ALLOWED_ORIGIN: 'https://example.invalid?source=form' },
    { FORM_ALLOWED_ORIGIN: 'https://example.invalid#form' },
    { FORM_ALLOWED_ORIGIN: 'ftp://example.invalid' },
    { FORM_ALLOWED_ORIGIN: Array.from({ length: 11 }, (_, index) => `https://site-${index}.example.invalid`).join(',') },
  ]) {
    const response = await handleRequest(requestFor(), environment(overrides), { fetch: turnstileFor() });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, error: 'service_unavailable' });
  }
});

test('合法單張圖片會以附件送出，檔名由 Worker 依 MIME 固定產生', async () => {
  const sent = [];
  const png = Buffer.from('89504e470d0a1a0a00000000', 'hex').toString('base64');
  const response = await handleRequest(
    requestFor({ ...validBody, attachment: { type: 'image/png', content: png } }),
    environment({ REPORT_EMAIL: { send: async (message) => sent.push(message) } }),
    { fetch: turnstileFor() },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(sent[0].attachments, [{
    content: png,
    filename: 'report-screenshot.png',
    type: 'image/png',
    disposition: 'attachment',
  }]);
});

test('不支援格式、偽造 magic bytes 或多餘附件欄位會在驗證前拒絕', async () => {
  const cases = [
    { type: 'image/gif', content: Buffer.from('GIF89a').toString('base64') },
    { type: 'image/png', content: Buffer.from('not-a-png').toString('base64') },
    { type: 'image/jpeg', content: Buffer.from('ffd8ff00', 'hex').toString('base64'), filename: 'user-name.jpg' },
  ];
  for (const attachment of cases) {
    let fetches = 0;
    let sends = 0;
    const response = await handleRequest(
      requestFor({ ...validBody, attachment }),
      environment({ REPORT_EMAIL: { send: async () => { sends += 1; } } }),
      { fetch: async () => { fetches += 1; return turnstileFor()(); } },
    );
    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), { ok: false, error: 'invalid_attachment' });
    assert.equal(fetches, 0);
    assert.equal(sends, 0);
  }
});

test('寄信例外回傳穩定錯誤且不洩漏 provider 細節', async () => {
  const originalError = console.error;
  console.error = () => undefined;
  try {
    const failed = await handleRequest(
      requestFor(),
      environment({ REPORT_EMAIL: { send: async () => { throw new Error('provider detail'); } } }),
      { fetch: turnstileFor() },
    );
    assert.equal(failed.status, 502);
    assert.deepEqual(await failed.json(), { ok: false, error: 'delivery_failed' });
  } finally {
    console.error = originalError;
  }
});
