# Privacy Policy — מזל טוב! / Greetings App

_Last updated: 2026-07-03_

The Greetings App ("the app") is designed to keep your data on your own device. This policy
explains what the app accesses and where it goes.

## What the app stores, and where
- **Your events and settings** (names, dates, relationships, phone numbers, notes, preferences)
  are stored **only on your device** (in the app's local storage). There is **no account and no
  server** operated by us that receives or stores your event data.
- You can optionally protect this data with an **App Lock** (a passphrase; on Android the device
  keystore / fingerprint), which encrypts it at rest on the device.

## Permissions the app may request (all optional, on your action)
- **Contacts (read-only)** — only when you tap "import from contacts", to fill in a name/phone.
- **Calendar (read-only)** — only when you tap "sync", to show events on the in-app calendar.
- **Notifications** — to remind you of upcoming events.
The app never modifies your contacts or calendar, and never uploads them anywhere.

## Data that leaves the device (only when you use these features)
- **AI greetings.** When you generate a greeting, the greeting prompt (the celebrant's name,
  occasion, relationship, and any note you type) is sent over HTTPS to the AI provider that
  produces the text — either a shared proxy we host or, if you enter your own key, your chosen
  provider (Google Gemini / Groq / OpenRouter). Only what's needed to write the greeting is sent.
  Do not put anything in the notes/custom field you wouldn't want that provider to process.
- **Google Contacts / Calendar (optional).** If you choose "Google" as the source and sign in,
  the app reads (read-only) your Google contacts/calendar via Google's APIs, using a token stored
  only on your device. Sign-in is optional; the device's own contacts/calendar work without it.
- **Update check.** On launch the app checks this project's public GitHub Releases page to see if
  a newer version exists. This is a normal request to GitHub; no personal data is sent.

## Sharing greetings
When you send a greeting via WhatsApp, that happens through WhatsApp itself (the app just opens a
pre-filled message); it is subject to WhatsApp's own privacy policy.

## Your control
Your data lives on your device — uninstalling the app removes it. You can revoke Contacts,
Calendar, or Notification permissions at any time in your device settings.

## Contact
Questions: open an issue on the project's GitHub repository.
