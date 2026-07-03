# מזל טוב! · Greetings App

A Hebrew (RTL) app to track people's events — birthdays, anniversaries, graduations, and more —
and generate personalized AI greetings to send over WhatsApp. Runs as a web app and as an
Android app (via Capacitor). All your data stays **on your device**.

## Features
- **Events**: add/edit/delete; free‑text occasion & relationship; recurrence (once/yearly/
  monthly/weekly); couple/plural gender; proxy delivery (greet someone *about* a third person).
- **Hebrew calendar**: show Hebrew dates alongside Gregorian; per‑event greet on the Gregorian
  date, the Hebrew anniversary, or both.
- **Calendar view**: month grid with your events + optional device/Google calendar overlay;
  tap a day to see/add events.
- **AI greetings**: a built‑in no‑key option (a hosted proxy), or bring your own key
  (Google Gemini / Groq / OpenRouter). Falls back to built‑in Hebrew templates offline.
- **Contacts & calendar**: import from the device or from Google (read‑only, on your action).
- **Reminders**: local notifications for upcoming events.
- **Privacy**: data is stored only on the device; optional App Lock encrypts it at rest.

## Tech
React 19 · TypeScript · Vite · Capacitor (Android) · `@hebcal/core` for Hebrew dates.

## Develop
```bash
npm install
npm run dev      # web dev server
npm run build    # type-check + production build
```

## Android
```bash
npm run android:sync   # build web + copy into the android/ project
npm run android:open   # open in Android Studio
```
Or build from the command line: `cd android && ./gradlew assembleRelease`.
Release builds are produced by GitHub Actions and published to the **Releases** page.

## Privacy & license
- Privacy policy: [PRIVACY.md](./PRIVACY.md) — data stays on your device.
- License: [GNU GPL v3](./LICENSE) — a copyleft license: derivative works must also be
  released as open source under the GPL.

The AI proxy lives in [`worker/`](./worker) (a Cloudflare Worker). The Google OAuth client ID in
`src/main.tsx` is a public identifier, not a secret. Real keys/tokens are never committed.
