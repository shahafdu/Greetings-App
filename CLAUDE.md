# CLAUDE.md — Agent Quick-Start Guide

Quick orientation for any future Claude session working on this repo. Read this first, then
`docs/STATUS.md` (where we are + todo) and `docs/SESSION_SUMMARY.md` (key decisions/history).

## What this is
**"מזל טוב!" / Greetings App** — a Hebrew (RTL) app to track people's events (birthdays,
anniversaries, graduations, etc.) and generate personalized AI greetings to send via WhatsApp.
Currently a **web app** (React 19 + TypeScript + Vite 8), tested on Windows. **Goal: an Android
APK** (via Capacitor — not yet scaffolded). It must work on both web and Android.

## Run / build
```bash
npm run dev      # Vite dev server at http://localhost:5173/  (usually already running in background)
npm run build    # tsc -b && vite build  — ALWAYS run this to verify before committing
npm run lint     # eslint (optional)
```
There are **no automated tests**. Verify by building + manual check in the browser.

## Architecture / key files
- `src/App.tsx` — the whole UI (large single component). Tabs: **אנשי קשר** (list + add/edit form),
  **לוח שנה** (calendar with Google-event overlay), **מחולל מהיר** (quick generator), **הגדרות** (settings).
- `src/services/storage.ts` — data model (`Person`, `AppSettings`), **in-memory cache + persistence**,
  App Lock functions, provider model lists, date/relation helpers.
- `src/services/gemini.ts` — **multi-provider AI** despite the name: Gemini, Groq, OpenRouter.
  `generateHebrewBirthdayGreeting`, `testAiApiKey`, `fetchOpenRouterFreeModels`, plus the Hebrew
  template fallback (`generateFallbackGreeting`).
- `src/services/google.ts` — Google **People API** (contacts) + **Calendar API**.
- `src/services/vault.ts` — AES-GCM passphrase encryption (the App Lock).
- `src/index.css` — glassmorphic dark theme, RTL. `src/main.tsx` — entry + Google OAuth provider.

## Conventions & gotchas (important)
- **Hebrew + RTL.** All UI text is Hebrew. Phone numbers/dates must render LTR — use the
  `.phone-number` class + `dir="ltr"` for phones, `.numbers-font` for other numerics.
- **Hebrew grammar needs BOTH genders:** the recipient's gender *and* the sender's gender
  (`settings.senderGender`) drive verb forms ("מאחל" vs "מאחלת"). There's also a "Couple/רבים" gender.
- **Per-user AI keys, no shared key.** Each user enters their own key (privacy + free-tier reality).
  Gemini free tier is often `quota: 0` by region. **Groq** `gpt-oss-120b` works well for Hebrew.
  **OpenRouter** free models are **fetched live** (`fetchOpenRouterFreeModels`) — never hardcode slugs;
  they change (e.g. Gemma 4 is `google/gemma-4-31b-it:free`). No key ⇒ built-in template fallback.
- **DATA SAFETY IS CRITICAL.** Events live in the browser's localStorage. We lost the user's data
  twice via storage bugs — be extremely careful with `storage.ts`. Safeguards now in place:
  in-memory cache, a **self-healing mirror** (`birthday_greetings_people_mirror`), and `persist()`
  that never writes empty/plaintext-when-locked. **Never** seed defaults over existing data; never
  write `[]`. There is intentionally **no plaintext JSON export** (security).
- **Encryption = the App Lock** (opt-in passphrase, AES-GCM). On Android this becomes automatic via
  the device keystore + biometric. Don't add fake "device-key" encryption (key next to data).
- **Google OAuth `CLIENT_ID` in `main.tsx` is public** (fine to commit). Real keys/contacts/events
  are **never** committed — `greetings-backup-*.json` is gitignored.
- **localStorage keys:** `birthday_greetings_` + `people`, `settings`, `people_mirror`, `vault_data`,
  `vault_meta`, `google_token`, `google_auth_active`, `restore_done`.

## Git workflow
Branch off `main`, build to verify, commit, then fast-forward merge to `main` and push (the owner
works on `main`). `gh` is NOT installed. Remote: `git@github.com:shahafdu/Greetings-App.git`.
