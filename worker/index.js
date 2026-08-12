/**
 * TinyPress Feedback Worker
 * POST /feedback -> store into KV (rate-limited per IP)
 * GET  /view?secret=... -> simple HTML viewer
 */
const ALLOWED_ORIGINS = [
  'https://fiersity.github.io',
  'http://localhost:8123',
  'http://127.0.0.1:8123',
];

const corsHeaders = (origin) => ({
  'Access-Control-Allow-Origin': origin || '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
});

function json(body, status = 200, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin) },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : null;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(allowed) });
    }

    // 查看页
    if (url.pathname === '/view') {
      const secret = url.searchParams.get('secret') || '';
      if (secret !== env.READ_SECRET) {
        return new Response('Forbidden', { status: 403 });
      }
      return serveView(env);
    }

    // 清空全部反馈（需 READ_SECRET）
    if (url.pathname === '/clear' && request.method === 'POST') {
      const secret = (request.headers.get('X-Secret') || '').trim();
      if (secret !== env.READ_SECRET) {
        return json({ error: 'Forbidden' }, 403, allowed);
      }
      const list = await env.TINYPRESS_FEEDBACK.list({ prefix: 'fb:' });
      let removed = 0;
      for (const k of list.keys) {
        await env.TINYPRESS_FEEDBACK.delete(k.name);
        removed++;
      }
      return json({ ok: true, removed }, 200, allowed);
    }

    if (url.pathname !== '/feedback' || request.method !== 'POST') {
      return json({ error: 'Not found' }, 404, allowed);
    }

    // 仅允许白名单来源（无 Origin 的 curl 也放行，方便调试）
    if (origin && !allowed) {
      return json({ error: 'Origin not allowed' }, 403, origin);
    }

    // 限流：每 IP 每分钟最多 3 条
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const rateKey = 'rl:' + ip;
    const count = Number((await env.TINYPRESS_FEEDBACK.get(rateKey)) || 0);
    if (count >= 3) {
      return json({ error: 'Too many requests, try again later' }, 429, allowed);
    }
    await env.TINYPRESS_FEEDBACK.put(rateKey, String(count + 1), { expirationTtl: 60 });

    // 读取并校验正文
    let body;
    try {
      body = await request.json();
    } catch (_) {
      return json({ error: 'Invalid JSON' }, 400, allowed);
    }
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const product = body.product === 'WebReader' ? 'WebReader' : 'TinyPress';
    const language = body.language === 'zh' || body.language === 'en' ? body.language : null;
    if (!text || text.length > 2000) {
      return json({ error: 'Feedback must be 1-2000 chars' }, 400, allowed);
    }

    // 存入 KV，key = 时间戳-随机后缀
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    const key = 'fb:' + ts + '-' + rand;
    const record = {
      text,
      product,
      language,
      ip,
      ua: request.headers.get('User-Agent') || '',
      ts,
    };
    await env.TINYPRESS_FEEDBACK.put(key, JSON.stringify(record));

    return json({ ok: true, id: key }, 200, allowed);
  },
};

async function serveView(env) {
  const list = await env.TINYPRESS_FEEDBACK.list({ prefix: 'fb:' });
  const items = [];
  for (const k of list.keys) {
    try {
      items.push(JSON.parse(await env.TINYPRESS_FEEDBACK.get(k.name)));
    } catch (_) { /* skip bad records */ }
  }
  items.sort((a, b) => b.ts - a.ts);

  const rows = items.map((it) => `
    <div class="fb">
      <div class="meta">${new Date(it.ts).toLocaleString()} · ${escapeHtml(it.product || 'TinyPress')}${it.language ? `/${escapeHtml(it.language)}` : ''} · ${it.ip || ''} · ${it.ua ? escapeHtml(it.ua.slice(0, 60)) : ''}</div>
      <div class="txt">${escapeHtml(it.text)}</div>
    </div>`).join('') || '<p>还没有反馈。</p>';

  return new Response(`<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TinyPress 反馈</title>
<style>
body{font-family:-apple-system,system-ui,sans-serif;background:#f5f7fb;color:#1f2430;margin:0;padding:24px}
.wrap{max-width:720px;margin:0 auto}
h1{font-size:20px}
.fb{background:#fff;border:1px solid #e5e9f2;border-radius:12px;padding:14px 16px;margin-bottom:12px}
.meta{font-size:12px;color:#6b7280;margin-bottom:6px}
.txt{font-size:14px;white-space:pre-wrap;word-break:break-word}
</style></head><body><div class="wrap">
<h1>工具反馈（${items.length}）</h1>
${rows}
</div></body></html>`, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
