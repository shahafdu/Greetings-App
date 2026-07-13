# Project Status & TODO

_Last updated: 2026-06-27_

## Where we are
The **web app is feature-complete and stable** for the web/Windows phase. Next major effort:
**adapt to Android** (Capacitor + native features). See the Android plan below.

## What works (web, tested on Windows)
- **Events**: full add/edit/delete; free-text occasion & relationship ("אחר"); recurrence
  (once/yearly/monthly/weekly); 15 relationship types incl. in-laws; couple/plural gender.
- **Calendar tab**: month grid; Google Calendar events overlaid as dashed chips → click to import
  (auto-links a matching contact's phone).
- **Google integration** (real): Contacts via People API, Calendar via Calendar API, using the
  OAuth token. Searchable contacts picker. Inline "sign in with Google" in the import prompts.
  Token persists across restarts (~1h; inline re-login on expiry).
  → Requires **People API + Calendar API enabled** in the user's Google Cloud project.
- **AI greetings**: providers **Gemini / Groq / OpenRouter** (each user's own key); model pickers;
  OpenRouter free models fetched live; test-key button; visible error surfacing; tone presets;
  custom instructions; **inline editing** of the greeting; **proxy delivery** (greet via a third
  party / family group); **sender-name signature**; sender+recipient gender grammar. Falls back to
  built-in Hebrew templates with no key.
- **Greeting drafts**: save an edited greeting as a **draft on an event** (multiple per event) and
  reload it later; the quick generator has its own **standalone drafts list** (save/load/delete,
  no auto-restore). Saved event drafts are fed back to the AI as **style examples** on the next
  generation. Drafts are opt-in for export/import (off by default). Delete supported everywhere.
- **AI guardrails** (`services/aiGuard.ts`): client-side rate limits (per minute/hour/day) on real
  AI calls, a length cap on user free-text, and prompt hardening so custom instructions can only
  personalize a greeting (not repurpose the model). On a rate-limit trip the template fallback is
  shown with an explanatory note. The **Worker proxy enforces the real caps** server-side
  (`worker/greetings-ai-proxy.js`): per-IP 6/min + 30/day, greetings-only request shape, model
  allowlist, 600-token completion clamp. Re-deploy with `npx wrangler deploy` after changes.
- **WhatsApp**: send via `wa.me` (click-to-send, pre-filled text).
- **App Lock**: opt-in passphrase AES-GCM encryption of all data at rest. Self-healing storage.

## Known limitations / not done (the Android work)
- **Native device contacts/calendar** — currently Google APIs only (no on-device contacts/local calendars).
- **Real OS permissions** for contacts/calendar/notifications — none yet.
- **Real scheduled notifications** — none (the old demo popup was removed). The per-event
  notify settings in the form are stored but don't fire yet; they'll drive Android notifications.
- **Mobile Google Sign-In** — the web OAuth popup will likely break inside the Android webview.
- **Automatic encryption on Android** (keystore + biometric unlock) — App Lock is passphrase-only for now.
- **APK packaging** — Capacitor not yet added (install was interrupted at the end of the last session).

## Android adaptation plan (TODO)
- [x] **Phase 1 — Capacitor scaffold** ✅ (2026-06-28): Capacitor 8.4.1 installed; `cap init`
      (appId `com.shahaf.greetings`, appName "Greetings", webDir `dist`); `android/` project created;
      app icon + splash generated from `assets/icon.png` (1024×1024) via `@capacitor/assets`.
      Scripts: `npm run android:sync` (build + sync), `android:open`, `android:icons`.
      **NEXT for owner**: install Android Studio + SDK, then `npm run android:open` → Build/Run the APK.
- [~] **Phase 2 — native features** — all BUILT on branch `feature/android-phase2`, **NOT merged,
      NOT yet tested on a device**:
  - [x] Native Google Sign-In (`@capawesome/capacitor-google-sign-in`) — replaces the webview popup.
        Needs an Android OAuth client in Google Cloud (package `com.shahaf.greetings` + debug SHA-1
        `A7:29:3B:30:50:A9:79:1A:47:01:75:9D:D3:A1:F6:8F:01:C5:D8:91`) — already created.
  - [x] Local notifications (`@capacitor/local-notifications`) — reminders from per-event settings.
  - [x] Native device contacts + calendar (`@capacitor-community/contacts`, `@ebarooni/capacitor-calendar`).
        On Android the picker/sync read the DEVICE's own data (permission-gated, no Google login).
  - [x] Biometric unlock + Keystore (`@capgo/capacitor-native-biometric`) — fingerprint stores/retrieves
        the passphrase to unlock the vault; typed passphrase remains the fallback.
  - [ ] Verify WhatsApp opens via Android intent (untested).
  - [ ] **TEST the whole branch on a device, then merge to main.**
- [ ] **Phase 3 — release**: signing config + release-key SHA-1 in Google Cloud, build signed APK/AAB.

## Constraints / decisions to remember
- Each user uses **their own AI key** (no shared/paid key). Someone always pays for AI usage.
- **No plaintext data exports.** Data stays on-device; encryption via App Lock (→ keystore on Android).
- Owner's environment: **Windows**, works on `main`, repo `shahafdu/Greetings-App`.
- Owner build prereq for APK: **Android Studio + SDK** (status: to be confirmed).
