const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};
const ISSUE_TYPES = {
  question: '題目錯誤',
  answer: '答案或解析',
  operation: '網站操作',
  display: '顯示問題',
  other: '其他',
};
const TRACKS = { init: '初訓', renew: '換證' };
const BANKS = { withLaw: '有詳解題庫', withoutLaw: '只有答案題庫', unknown: '不確定／不適用' };
const QUESTION_CONTEXTS = { random: '全題隨機練習', chapter: '章節練習', mock: '模擬考', wrong: '錯題練習', other: '其他／不確定' };
const ATTACHMENT_TYPES = {
  'image/png': { extension: 'png', signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  'image/jpeg': { extension: 'jpg', signature: [0xff, 0xd8, 0xff] },
  'image/webp': { extension: 'webp', signature: [0x52, 0x49, 0x46, 0x46], secondary: [0x57, 0x45, 0x42, 0x50] },
};
const MAX_ATTACHMENT_BYTES = 1_048_576;
const MAX_PAYLOAD_BYTES = 1_500_000;

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
const clean = (value) => typeof value === 'string' ? value.trim().replaceAll('\0', '') : '';
const withinLimit = (value, max) => clean(value).length <= max;
const headerFragment = (value, max) => Array.from(clean(value).replace(/[\s\p{Cc}]+/gu, ' ')).slice(0, max).join('');
const emailLocalIdentifier = (email) => headerFragment(email.slice(0, email.indexOf('@')), 32);

function validEmail(value) {
  if (value === '') return true;
  if (typeof value !== 'string' || value.length > 254 || !/^[\x21-\x7e]+$/.test(value)) return false;
  const at = value.indexOf('@');
  if (at < 1 || at !== value.lastIndexOf('@')) return false;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (local.length > 64 || domain.length > 253 || !/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/.test(local)) return false;
  const labels = domain.split('.');
  return labels.length >= 2
    && labels.every((label) => label.length <= 63 && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))
    && !/^\d+$/.test(labels.at(-1));
}

function parseAttachment(value) {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'content,type') return false;
  const type = clean(value.type);
  const content = value.content;
  const spec = ATTACHMENT_TYPES[type];
  if (!spec || typeof content !== 'string' || !content || content.length > 1_400_000
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content)) return false;
  try {
    const binary = atob(content);
    if (!binary.length || binary.length > MAX_ATTACHMENT_BYTES) return false;
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (!spec.signature.every((byte, index) => bytes[index] === byte)) return false;
    if (spec.secondary && !spec.secondary.every((byte, index) => bytes[index + 8] === byte)) return false;
    return {
      content,
      filename: `report-screenshot.${spec.extension}`,
      type,
      disposition: 'attachment',
    };
  } catch {
    return false;
  }
}

function parseAllowedOrigins(value) {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value)) return null;
  const entries = value.split(',').map((entry) => entry.trim());
  if (!entries.length || entries.length > 10 || entries.some((entry) => !entry || entry.includes('*'))) return null;
  const origins = new Set();
  try {
    for (const entry of entries) {
      const url = new URL(entry);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || entry !== url.origin) return null;
      origins.add(url.origin);
    }
  } catch {
    return null;
  }
  return origins.size === entries.length ? origins : null;
}

function readReportConfig(env) {
  const recipient = clean(env.REPORT_MAIL);
  const sender = clean(env.FORM_SENDER);
  const allowedOrigins = parseAllowedOrigins(env.FORM_ALLOWED_ORIGIN);
  const turnstileSecret = clean(env.TURNSTILE_SECRET_KEY);
  if (!env.REPORT_EMAIL?.send || !env.REPORT_RATE_LIMIT?.limit || !recipient || !sender || !validEmail(recipient) || !validEmail(sender) || !allowedOrigins || !turnstileSecret) return null;
  return { recipient, sender, allowedOrigins, turnstileSecret, rateLimiter: env.REPORT_RATE_LIMIT };
}

function parseReport(body) {
  const reporterEmail = clean(body.reporterEmail);
  if (typeof body.reporterEmail !== 'string' || body.reporterEmail !== reporterEmail || !reporterEmail || !validEmail(reporterEmail)) {
    return { invalidEmail: true };
  }
  const attachment = parseAttachment(body.attachment);
  if (attachment === false) return { invalidAttachment: true };
  if (!withinLimit(body.issueType, 24) || !withinLimit(body.track, 12) || !withinLimit(body.bank, 24)
    || !withinLimit(body.chapter, 3) || !withinLimit(body.questionId, 80) || !withinLimit(body.description, 2000)
    || !withinLimit(body.questionContext, 16) || !withinLimit(body.questionNumber, 4)
    || !withinLimit(body.reporterName, 80) || !withinLimit(body.pagePath, 200)
    || !withinLimit(body.deviceSummary, 300)) return null;

  const issueType = clean(body.issueType);
  const track = clean(body.track);
  const bank = clean(body.bank) || 'unknown';
  const questionContext = clean(body.questionContext);
  const chapter = clean(body.chapter);
  const questionNumber = clean(body.questionNumber);
  const questionId = clean(body.questionId);
  const reporterName = clean(body.reporterName);
  const description = clean(body.description);
  const pagePath = clean(body.pagePath);
  const deviceSummary = clean(body.deviceSummary);

  if (!Object.hasOwn(ISSUE_TYPES, issueType) || !Object.hasOwn(TRACKS, track) || !Object.hasOwn(BANKS, bank)
    || !Object.hasOwn(QUESTION_CONTEXTS, questionContext) || (questionNumber && !/^[1-9]\d{0,3}$/.test(questionNumber))
    || !reporterName || description.length < 10
    || (chapter && !/^\d{1,3}$/.test(chapter)) || (questionId && !/^[A-Za-z0-9._:/-]{1,80}$/.test(questionId))
    || !pagePath.startsWith('/') || pagePath.includes('?') || pagePath.includes('#')
    || body.privacyConfirmed !== 'on') return null;
  const subjectContext = questionNumber ? `第${questionNumber}題` : questionId || (chapter ? `第${chapter}章` : '一般');
  const subject = `【題庫問題回報｜${TRACKS[track]}・${ISSUE_TYPES[issueType]}】${headerFragment(reporterName, 24)}・${emailLocalIdentifier(reporterEmail)}・${headerFragment(subjectContext, 40)}`;
  const text = [
    '收到一筆租賃住宅管理人員題庫問題回報。', '',
    `回報人：${reporterName}`,
    `回報人 Email：${reporterEmail}`,
    '回覆方式：直接回覆本信將寄至上述 Email。',
    `問題類型：${ISSUE_TYPES[issueType]}`,
    `題庫類型：${TRACKS[track]}`,
    `題庫版本：${BANKS[bank]}`,
    `題目出現於：${QUESTION_CONTEXTS[questionContext]}`,
    `章節：${chapter || '未提供'}`,
    `目前顯示題次：${questionNumber ? `第 ${questionNumber} 題` : '未提供'}`,
    `系統題目識別碼：${questionId || '未提供'}`,
    `頁面：${pagePath}`,
    `裝置摘要：${deviceSummary || '未提供'}`, '',
    '問題描述：', description, '',
    '回報者已確認內容不含密碼、證件、付款資料或其他敏感個資。',
  ].join('\n');
  return { reporterEmail, subject, text, attachment };
}

async function verifyTurnstile(token, request, turnstileSecret, hostname, fetchImpl) {
  if (!token) return false;
  const payload = new FormData();
  payload.set('secret', turnstileSecret);
  payload.set('response', token);
  const remoteIp = request.headers.get('CF-Connecting-IP');
  if (remoteIp) payload.set('remoteip', remoteIp);
  try {
    const response = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: payload });
    if (!response.ok) return false;
    const result = await response.json();
    return result.success === true && result.hostname === hostname && result.action === 'issue-report';
  } catch {
    return false;
  }
}

export async function handleRequest(request, env, services = { fetch }) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/forms/issue-report') return env.ASSETS.fetch(request);
  if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  const config = readReportConfig(env);
  if (!config) return json({ ok: false, error: 'service_unavailable' }, 503);
  const requestOrigin = request.headers.get('Origin');
  if (!config.allowedOrigins.has(requestOrigin)) return json({ ok: false, error: 'forbidden' }, 403);
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return json({ ok: false, error: 'invalid_content_type' }, 415);
  }
  if (Number(request.headers.get('content-length') || 0) > MAX_PAYLOAD_BYTES) return json({ ok: false, error: 'payload_too_large' }, 413);

  let body;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_PAYLOAD_BYTES) return json({ ok: false, error: 'payload_too_large' }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ ok: false, error: 'invalid_fields' }, 422);
  if (clean(body.company)) return json({ ok: true }, 202);

  try {
    const clientKey = request.headers.get('cf-connecting-ip') || 'unknown';
    const rate = await config.rateLimiter.limit({ key: `issue-report:${clientKey}` });
    if (!rate?.success) return json({ ok: false, error: 'rate_limited' }, 429);
  } catch {
    return json({ ok: false, error: 'service_unavailable' }, 503);
  }

  const parsed = parseReport(body);
  if (parsed?.invalidEmail) return json({ ok: false, error: 'invalid_email' }, 422);
  if (parsed?.invalidAttachment) return json({ ok: false, error: 'invalid_attachment' }, 422);
  if (!parsed) return json({ ok: false, error: 'invalid_fields' }, 422);
  if (!await verifyTurnstile(clean(body.turnstileToken), request, config.turnstileSecret, new URL(requestOrigin).hostname, services.fetch)) {
    return json({ ok: false, error: 'verification_failed' }, 422);
  }

  try {
    const message = { to: config.recipient, from: config.sender, replyTo: parsed.reporterEmail, subject: parsed.subject, text: parsed.text };
    if (parsed.attachment) message.attachments = [parsed.attachment];
    await env.REPORT_EMAIL.send(message);
    return json({ ok: true });
  } catch {
    console.error('Issue report email delivery failed');
    return json({ ok: false, error: 'delivery_failed' }, 502);
  }
}

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};
