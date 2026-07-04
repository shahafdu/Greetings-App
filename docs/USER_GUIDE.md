# User Guide · מזל טוב! Greetings App

A friendly walkthrough of everything the app does. The app works in **Hebrew or English** — switch
anytime in **Settings → 🌐 Language** (the whole app flips direction accordingly).

> **Your data stays on your device.** There's no account and no server storing your events.

---

## Installing & updating
1. Open the repo's **Releases** page and download **`greetings.apk`**.
2. Tap it on your phone. The first time, Android asks to allow "install unknown apps" — allow it.
3. On later launches, if a newer build exists, a **"New version available"** banner appears — tap
   **Download** to get it. Updates install over the old app **without losing your events**.

---

## The four tabs
- **Events** — your list of people/events, add/edit, and generate greetings.
- **Calendar** — a month grid; overlay your device/Google calendar; tap a day for its events.
- **Quick generator** — write a one‑off greeting without saving anyone.
- **Settings** — language, AI, sign‑in, app lock, sharing, and more.

---

## Adding an event
On **Events**, tap **+ New event** and fill in:
- **First / last name** — or tap **Import from contacts** to auto‑fill from your device/Google.
- **Event type** — birthday, anniversary, graduation, etc., or **Other** for free text.
- **Date** — the Gregorian date.
- **Recurrence** — one‑time, yearly, monthly, or weekly.
- **Relationship**, **gender** (for correct grammar), optional **phone** (for WhatsApp) and **notes**
  (hobbies/wishes the AI can weave in).
- **Reminder** — when and at what time to be notified.
- **Proxy delivery** (optional) — address the greeting to *someone else* about the celebrant (e.g. a
  parent or a family group).

Tap **Add event** (or **Save changes**). To edit or delete later, use the ✎ / 🗑 buttons on the card.

---

## Hebrew dates
Turn on **Settings → 🕎 Show Hebrew dates**. Then:
- The **calendar** shows the Hebrew day + month/year next to the Gregorian one.
- Each **event** shows its Hebrew date, auto‑computed from the Gregorian date. Tap **Edit** to fine
  tune the **day** (Hebrew letters) and **month**.
- **Born after sunset?** The Hebrew day starts at sundown, so tick this box if the person was born in
  the evening — the Hebrew date shifts forward one day (near Rosh Hashana it can even change the year).
- **When to greet** — choose per event: **Gregorian only**, **Hebrew only**, or **both** (greets on
  whichever comes first, and shows on both dates in the calendar).

---

## Generating a greeting
From an event card tap **Greeting** (or use the **Quick generator**). In the greeting window:
- Pick the **language** (defaults to the app language) and the **tone** (warm / funny / emotional /
  short). Changing either regenerates instantly.
- Add a **special instruction** for the AI (e.g. "wish him a great trip") and regenerate.
- Edit the text directly if you like, then **Copy** or **Send on WhatsApp** (opens the chat if a
  phone number is set).

### AI options (Settings → AI provider)
- **Built‑in (no key)** — works out of the box, nothing to set up.
- **Your own key** — Google Gemini / Groq / OpenRouter. Each stores the key **only on your device**.
  Use **Test key** to check it. If a provider is rate‑limited, switch to another.
- **No key at all** — the app still produces a nice **template** greeting offline.

Set **your name** (Hebrew and English) in Settings to sign greetings (e.g. "With love, Dana").

---

## Calendar & syncing
On **Calendar**, tap **Sync events** to overlay your **device** and **Google** calendars (both, if
signed in). Synced events show as dashed chips. **Tap a day** to open it: see that day's events, add
a new one, or import a synced event. Importing lets you review it before it's saved.

---

## Contacts
When adding an event, **Import from contacts** reads your **device** contacts (or Google, if you
sign in) — **read‑only**, and only when you ask. Pick a contact to auto‑fill the name, phone, and
birthday.

---

## Sharing / backing up events
**Settings → Share & back up events**:
1. Pick the events to share (tick **Include settings & keys** for a full backup) → **Create
   encrypted file**. The app shows a **6‑character code**.
2. **Share the file** — on WhatsApp it's sent as a **document**, or attach it to an email. **Send the
   code separately** (that's what keeps it private). Files transfer intact at any size; pasted text
   isn't used because messengers can truncate long messages.
3. On the other device: **Settings → Import events** → **pick the file** → enter the code →
   **preview** → **Import & merge** (duplicates skipped; tick **restore settings** for a full backup).

Use it to move to a new phone/tablet, or to give your whole list to a family member.

---

## Reminders
Each event can notify you on (or before) the day, at a time you choose. Reminders follow the event's
date mode (Gregorian / Hebrew / both).

---

## Privacy & App Lock
Everything lives on your device. For extra protection, **Settings → App Lock** encrypts all data
behind a passphrase (with optional fingerprint unlock). ⚠️ If you forget the passphrase, the
encrypted data **cannot** be recovered — keep it safe, and use the export feature to keep a backup.

---

## Tips
- **WhatsApp**: add a phone number to an event to open the chat straight from the greeting.
- **Couple/plural**: set gender to *Couple* for anniversary greetings to a couple or a group.
- **Free text**: "Other" lets you type any occasion or relationship.
