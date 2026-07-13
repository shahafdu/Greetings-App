# Greetings AI proxy (Cloudflare Worker)

A tiny server that holds **one** AI key so app users don't need their own. The app sends an
OpenAI-style request here; the Worker forwards it to **Groq** with your key and returns the reply.
Free to run (Cloudflare Workers free tier = 100k requests/day).

## One-time setup

1. **Create a free Groq key** → https://console.groq.com/keys (copy it).
2. **Create a free Cloudflare account** → https://dash.cloudflare.com/sign-up
3. Install Node if you don't have it, then from this `worker/` folder:

   ```bash
   npx wrangler login                 # opens the browser to authorize
   npx wrangler secret put GROQ_API_KEY   # paste your Groq key when prompted
   npx wrangler deploy                 # prints your Worker URL
   ```

   The deploy prints a URL like `https://greetings-ai-proxy.<you>.workers.dev`.

4. **Give that URL to me** (or paste it yourself) into `AI_PROXY_URL` in
   `src/services/gemini.ts`. Once set, the app shows a **"מובנה (ללא מפתח)"** AI option that
   works with no user key.

## Abuse guardrails

The Worker is the real enforcement point (the app's client-side limits are best-effort, since
the URL is public in the app source). Baked into the code, no setup needed:

- **Greetings-only request shape**: max 2 user text messages, no system/assistant roles, prompt
  capped at 8,000 chars — multi-turn chat or oversized inputs are rejected with 400.
- **Model allowlist**: unknown model ids are coerced to the default, so the key can't be pointed
  at other models. Completion size is clamped to 600 tokens.
- **Per-IP rate limits** (needs the RL KV binding, see below): 6/minute burst + 30/day.

Optional extras:

- **Rate limit binding** (enables the per-IP caps): `npx wrangler kv namespace create RL`, paste
  the id into `wrangler.toml`, then `npx wrangler deploy`. (Already configured in this repo's
  `wrangler.toml`; without the binding the shape checks still apply but calls are unmetered.)
- **Shared secret** (so only the app can call it): `npx wrangler secret put PROXY_TOKEN`, then set
  the same value in `AI_PROXY_TOKEN` in `src/services/gemini.ts`.

After changing the Worker code, re-deploy from this folder: `npx wrangler deploy`.

## Cost

Groq's free tier + Cloudflare's free tier cover a small group (family/friends) at **$0**. Greetings
are short and infrequent, so usage stays tiny. At larger scale you'd hit free-tier caps — then
either upgrade the key or keep per-user keys as the unlimited option.
