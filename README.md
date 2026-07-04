# מזל טוב! · Greetings App

A **Hebrew/English** app to track people's events — birthdays, anniversaries, graduations, and
more — and generate personalized **AI greetings** to send over WhatsApp. Runs as a web app and as
an **Android** app (via Capacitor). All your data stays **on your device**.

📖 **New here? Read the [User Guide](docs/USER_GUIDE.md).**

## Install (Android)
Grab the latest **`greetings.apk`** from the [**Releases**](https://github.com/shahafdu/Greetings-App/releases) page and open it on your
phone (allow "install unknown apps" once). The app checks for newer versions on launch.

## Features
- **Events** — add/edit/delete; free‑text occasion & relationship; recurrence (once / yearly /
  monthly / weekly); couple/plural gender; **proxy delivery** (greet someone *about* a third person).
- **Hebrew calendar** — show Hebrew dates alongside Gregorian; per‑event greet on the Gregorian
  date, the Hebrew anniversary, or both; **"after sunset"** correction for the Hebrew day rollover.
- **Calendar view** — month grid with your events + optional device/Google calendar overlay; tap a
  day to see/add events.
- **AI greetings** — a **built‑in, no‑key** option (a hosted proxy), or bring your own key
  (Google Gemini / Groq / OpenRouter). Per‑greeting **tone** and **language** (Hebrew/English).
  Falls back to built‑in templates with no key/offline.
- **Contacts & calendar** — import from the **device** or from **Google** (read‑only, on your action).
- **Reminders** — local notifications for upcoming events.
- **Share / back up events** — export selected events as an **encrypted** file/text (code sent
  separately) to move to another device or share with another person; import & merge.
- **Bilingual UI** — switch Hebrew/English in Settings (RTL ↔ LTR).
- **Privacy** — data is stored only on the device; optional **App Lock** encrypts it at rest.

## Tech
React 19 · TypeScript · Vite · Capacitor (Android) · `@hebcal/core` (Hebrew dates).

## Develop
```bash
npm install
npm run dev      # web dev server
npm run build    # type-check + production build
```

## Android build
```bash
npm run android:sync   # build web + copy into the android/ project
npm run android:open   # open in Android Studio
```
Or from the command line: `cd android && ./gradlew assembleRelease`.
Release APKs are built by **GitHub Actions** on every push and published to **Releases**.

## Privacy & license
- Privacy policy: [PRIVACY.md](PRIVACY.md) — data stays on your device.
- License: [GNU AGPL v3](LICENSE) — strong copyleft: derivative works (including hosted/networked
  ones) must also be open source under the AGPL.

The optional AI proxy lives in [`worker/`](worker) (a Cloudflare Worker). The Google OAuth client
ID in `src/main.tsx` is a public identifier, not a secret; real keys/tokens are never committed.
