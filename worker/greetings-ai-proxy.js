// Cloudflare Worker — AI proxy for the Greetings app.
//
// Holds ONE AI key server-side so end users don't need their own. The app POSTs an
// OpenAI-style { model, messages } body here; the Worker forwards it to Groq using the
// GROQ_API_KEY secret and returns the response unchanged.
//
// Secrets / bindings (see worker/README.md for commands):
//   GROQ_API_KEY  (required)  — your Groq API key, set as a Wrangler secret.
//   PROXY_TOKEN   (optional)  — a shared secret; if set, callers must send it as a Bearer token.
//   RL            (optional)  — a KV namespace binding; if present, enforces a per-IP daily cap.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-oss-120b';
const DAILY_LIMIT = 30; // greetings per IP per day (only enforced when the RL KV binding exists)

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405, cors);

    // Optional shared-secret gate.
    if (env.PROXY_TOKEN) {
      const auth = request.headers.get('Authorization') || '';
      if (auth !== `Bearer ${env.PROXY_TOKEN}`) return json({ error: 'unauthorized' }, 401, cors);
    }

    // Optional per-IP daily rate limit (needs a KV namespace bound as RL).
    if (env.RL) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const key = `${ip}:${new Date().toISOString().slice(0, 10)}`;
      const used = parseInt((await env.RL.get(key)) || '0', 10);
      if (used >= DAILY_LIMIT) return json({ error: 'daily limit reached' }, 429, cors);
      await env.RL.put(key, String(used + 1), { expirationTtl: 86400 });
    }

    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400, cors); }
    if (!Array.isArray(body.messages)) return json({ error: 'messages[] required' }, 400, cors);

    const payload = {
      model: body.model || DEFAULT_MODEL,
      messages: body.messages,
      temperature: typeof body.temperature === 'number' ? body.temperature : 0.9,
      max_tokens: body.max_tokens || 600,
    };

    const r = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.GROQ_API_KEY}` },
      body: JSON.stringify(payload),
    });
    const text = await r.text();
    return new Response(text, { status: r.status, headers: { ...cors, 'Content-Type': 'application/json' } });
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
