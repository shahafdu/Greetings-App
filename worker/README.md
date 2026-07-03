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

## Optional hardening

- **Rate limit** (per-IP daily cap): `npx wrangler kv namespace create RL`, paste the id into
  `wrangler.toml` (uncomment the block), then `npx wrangler deploy`.
- **Shared secret** (so only the app can call it): `npx wrangler secret put PROXY_TOKEN`, then set
  the same value in `AI_PROXY_TOKEN` in `src/services/gemini.ts`.

## Cost

Groq's free tier + Cloudflare's free tier cover a small group (family/friends) at **$0**. Greetings
are short and infrequent, so usage stays tiny. At larger scale you'd hit free-tier caps — then
either upgrade the key or keep per-user keys as the unlimited option.
