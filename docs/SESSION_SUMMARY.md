# Session Summary (compressed context)

A condensed record of what was built and decided, so a future session doesn't need the full
transcript. Most recent session ending **2026-06-27**.

## What this session delivered (on top of the initial demo)
Starting point was a polished but largely **mock** demo. It was turned into a working app:

1. **Bug fixes & cleanup**: fixed a `process.env` browser crash (→ `import.meta.env`), a
   quick-generator stale-person bug, dead code, RTL phone display, calendar logic.
2. **Real Google integration**: replaced mock contacts/calendar with real **People API** +
   **Calendar API** calls using the OAuth token; calendar-grid overlay + click-to-import with
   automatic contact↔event phone linking; searchable contacts; inline Google login; token persistence.
3. **Multi-provider AI**: `gemini.ts` became provider-agnostic — **Gemini, Groq, OpenRouter**.
   Per-user keys, model pickers, test-key, error surfacing, inline greeting editing.
4. **Greeting quality**: sender gender + recipient gender grammar; **sender-name signature**;
   **proxy delivery** (address a greeting to someone else about the celebrant); free-text
   occasion/relationship; expanded relationships incl. in-laws; couple/plural gender.
5. **App Lock**: opt-in passphrase AES-GCM encryption (`vault.ts`) with an in-memory cache storage layer.
6. **UX**: sticky top bar + list header + add/edit form; "new event" button; scroll ↑/↓ by the search
   bar; "באמצעות AI" labels; removed the simulated notification button.

## Key learnings / decisions (don't re-derive these)
- **You cannot use a user's Google login to call Gemini.** The Gemini *app* has no third-party API;
  the Gemini *API* needs a separate key. There is no free, keyless, multi-user Gemini path.
- **Gemini free tier is frequently `quota: 0`** for the owner (region/account). Switching models
  doesn't help when the whole free tier is 0.
- **Groq**: `gpt-oss-120b` works well for Hebrew and is the owner's preferred free option. Groq
  dropped `gemma2`; doesn't host Gemma 3/4. (kimi-k2, llama-4, qwen were removed: didn't work / Chinese output.)
- **OpenRouter**: the way to get **free Gemma** (Gemma 4 exists: `google/gemma-4-31b-it:free`,
  `google/gemma-4-26b-a4b-it:free`) and gpt-oss `:free`. **Slugs change constantly** → the app
  **fetches the live free-model list** from `https://openrouter.ai/api/v1/models` (pricing 0) and
  auto-corrects stale selections. Never hardcode OpenRouter slugs.
- **Hosting Phi / in-browser LLM (WebLLM)**: judged **not worth it** — impractical on Android
  (WebGPU unreliable, heavy), big download, weak Hebrew. Use hosted free APIs instead.
- **Data loss happened TWICE** from the App Lock / caching storage layer. Root causes fixed:
  `persist()` could write plaintext when the vault key was lost; the loader seeded mock defaults
  over empty data. Now there's a **self-healing mirror** + guards. Treat `storage.ts` as
  safety-critical. **No plaintext JSON export** exists (the owner rejected it as insecure).
- **Encryption model**: passphrase App Lock on web; **on Android → device keystore + biometric**
  (automatic, no passphrase typing). Same encrypted store underneath. Don't ship fake device-key crypto.

## Repo facts
- Branch `main` on `git@github.com:shahafdu/Greetings-App.git`. Owner commits to `main`. `gh` not installed.
- Build: `npm run build` (tsc + vite). No tests. Dev server usually running on :5173.
- `greetings-backup-*.json` is gitignored (contains real keys/contacts — never commit).

## Immediate next step
Resume the **Capacitor scaffold** (Phase 1 in `docs/STATUS.md`); the `npm install @capacitor/*`
was interrupted at the end of this session. Confirm the owner has Android Studio + SDK for building the APK.
