// Cloudflare Worker — AI proxy for the Greetings app.
//
// Holds ONE AI key server-side so end users don't need their own. The app POSTs an
// OpenAI-style { model, messages } body here; the Worker forwards it to Groq using the
// GROQ_API_KEY secret and returns the response unchanged.
//
// Because the URL is public (it ships in the app source), the Worker also enforces the
// real abuse guardrails — the client-side limits in the app are best-effort only:
//   * per-IP rate limits (burst + daily) when the RL KV binding exists
//   * request-shape checks that only fit "generate one greeting" calls
//   * a model allowlist and a completion-size cap, so the key can't be used generically
//
// Secrets / bindings (see worker/README.md for commands):
//   GROQ_API_KEY  (required)  — your Groq API key, set as a Wrangler secret.
//   PROXY_TOKEN   (optional)  — a shared secret; if set, callers must send it as a Bearer token.
//   RL            (optional)  — a KV namespace binding; if present, enforces the per-IP caps.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-oss-120b';

// The only models the app offers for the built-in provider. Anything else is coerced to the
// default so the key can't be pointed at other (potentially costlier) models.
const ALLOWED_MODELS = new Set([
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
]);

// Per-IP rate limits (enforced only when the RL KV binding exists).
const DAILY_LIMIT = 30; // greetings per day — plenty for real use
const MINUTE_LIMIT = 6; // burst cap — stops scripted hammering within the daily budget

// A greeting prompt (with style examples) is a few thousand chars; a single user message.
// Requests outside that shape aren't coming from the app.
const MAX_PROMPT_CHARS = 8000;
const MAX_MESSAGES = 2;
const MAX_COMPLETION_TOKENS = 600;

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

    // Per-IP rate limits (needs a KV namespace bound as RL). KV read-then-write isn't atomic,
    // so a racing client can slip a request past the edge — fine for an abuse cap.
    if (env.RL) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const now = new Date();
      const dayKey = `${ip}:${now.toISOString().slice(0, 10)}`;
      const minuteKey = `${ip}:m:${Math.floor(now.getTime() / 60000)}`;
      const [dayUsed, minUsed] = await Promise.all([
        env.RL.get(dayKey).then(v => parseInt(v || '0', 10)),
        env.RL.get(minuteKey).then(v => parseInt(v || '0', 10)),
      ]);
      if (dayUsed >= DAILY_LIMIT) return json({ error: 'daily limit reached' }, 429, cors);
      if (minUsed >= MINUTE_LIMIT) return json({ error: 'too many requests, slow down' }, 429, cors);
      await Promise.all([
        env.RL.put(dayKey, String(dayUsed + 1), { expirationTtl: 86400 }),
        // KV's minimum TTL is 60s; 120 comfortably outlives the minute bucket.
        env.RL.put(minuteKey, String(minUsed + 1), { expirationTtl: 120 }),
      ]);
    }

    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400, cors); }
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return json({ error: 'messages[] required' }, 400, cors);
    }

    // Shape gate: the app sends a single user message containing the whole greeting prompt.
    // Multi-turn conversations, system prompts, or oversized inputs are not greeting requests.
    if (body.messages.length > MAX_MESSAGES) return json({ error: 'too many messages' }, 400, cors);
    let promptChars = 0;
    for (const m of body.messages) {
      if (!m || m.role !== 'user' || typeof m.content !== 'string') {
        return json({ error: 'only user text messages are accepted' }, 400, cors);
      }
      promptChars += m.content.length;
    }
    if (promptChars > MAX_PROMPT_CHARS) return json({ error: 'prompt too long' }, 400, cors);

    const payload = {
      model: ALLOWED_MODELS.has(body.model) ? body.model : DEFAULT_MODEL,
      messages: body.messages,
      temperature: typeof body.temperature === 'number' ? Math.min(Math.max(body.temperature, 0), 1.5) : 0.9,
      max_tokens: Math.min(body.max_tokens || MAX_COMPLETION_TOKENS, MAX_COMPLETION_TOKENS),
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
