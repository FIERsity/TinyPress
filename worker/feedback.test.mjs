import assert from 'node:assert/strict';
import test from 'node:test';
import worker from './index.js';

class MemoryKv {
  constructor() { this.values = new Map(); }
  async get(key) { return this.values.get(key) ?? null; }
  async put(key, value) { this.values.set(key, value); }
  async delete(key) { this.values.delete(key); }
  async list({ prefix }) {
    return { keys: [...this.values.keys()].filter((name) => name.startsWith(prefix)).map((name) => ({ name })) };
  }
}

function env() {
  return { TINYPRESS_FEEDBACK: new MemoryKv(), READ_SECRET: 'test-secret' };
}

function post(body, origin = 'https://fiersity.github.io') {
  return new Request('https://feedback.070315.site/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, 'CF-Connecting-IP': '203.0.113.8' },
    body: JSON.stringify(body),
  });
}

function feedbackRecords(kv) {
  return [...kv.values.entries()].filter(([key]) => key.startsWith('fb:')).map(([, value]) => JSON.parse(value));
}

test('stores structured WebReader feedback and remains compatible with old clients', async () => {
  const bindings = env();
  const response = await worker.fetch(post({ text: '阅读建议', product: 'WebReader', language: 'zh' }), bindings);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://fiersity.github.io');
  assert.deepEqual(feedbackRecords(bindings.TINYPRESS_FEEDBACK)[0], {
    text: '阅读建议', product: 'WebReader', language: 'zh', ip: '203.0.113.8', ua: '',
    ts: feedbackRecords(bindings.TINYPRESS_FEEDBACK)[0].ts,
  });

  await worker.fetch(post({ text: 'legacy feedback', product: 'UnknownTool', language: 'fr' }), bindings);
  assert.equal(feedbackRecords(bindings.TINYPRESS_FEEDBACK)[1].product, 'TinyPress');
  assert.equal(feedbackRecords(bindings.TINYPRESS_FEEDBACK)[1].language, null);
});

test('rejects untrusted origins and invalid feedback text', async () => {
  const bindings = env();
  assert.equal((await worker.fetch(post({ text: 'no' }, 'https://example.com'), bindings)).status, 403);
  assert.equal((await worker.fetch(post({ text: '' }), bindings)).status, 400);
  assert.equal((await worker.fetch(post({ text: 'x'.repeat(2001) }), bindings)).status, 400);
  assert.equal(feedbackRecords(bindings.TINYPRESS_FEEDBACK).length, 0);
});

test('escapes stored feedback and product labels in the protected viewer', async () => {
  const bindings = env();
  bindings.TINYPRESS_FEEDBACK.values.set('fb:1-test', JSON.stringify({
    text: '<script>alert(1)</script>', product: '<img>', language: 'zh', ip: '', ua: '', ts: 1,
  }));
  const response = await worker.fetch(new Request('https://feedback.070315.site/view?secret=test-secret'), bindings);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img&gt;\/zh/);
  assert.doesNotMatch(html, /<script>alert/);
});
