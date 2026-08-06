import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));

test('Wrangler 版本化問題回報 runtime variables 欄位', () => {
  assert.deepEqual(Object.keys(config.vars).sort(), [
    'FORM_ALLOWED_ORIGIN',
    'FORM_SENDER',
    'REPORT_MAIL',
  ]);
  for (const value of Object.values(config.vars)) assert.equal(typeof value === 'string' && value.length > 0, true);
});

test('Wrangler 版本化受限制的 REPORT_EMAIL binding', () => {
  assert.equal(config.send_email.length, 1);
  assert.deepEqual(config.send_email[0], {
    name: 'REPORT_EMAIL',
    destination_address: config.vars.REPORT_MAIL,
    allowed_sender_addresses: [config.vars.FORM_SENDER],
  });
});

test('Wrangler 不會把 Turnstile secret 寫進版控設定', () => {
  assert.equal(Object.hasOwn(config.vars, 'TURNSTILE_SECRET_KEY'), false);
});
