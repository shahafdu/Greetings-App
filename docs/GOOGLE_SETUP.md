# Google Cloud Console Setup Instructions

To get your `CLIENT_ID` for this project:

1. **Go to Google Cloud Console**: [https://console.cloud.google.com/](https://console.cloud.google.com/)
2. **Create a New Project**:
   - Click on the project dropdown at the top of the page.
   - Click "New Project" and give it a name (e.g., "Birthday Greetings App").
3. **Configure OAuth Consent Screen**:
   - Go to "APIs & Services" > "OAuth consent screen" from the left menu.
   - Choose "External" and click "Create".
   - Fill in the required app information (App name: "Birthday Greetings App", Support email, Developer contact email).
   - Click "Save and Continue" through the scopes and test users. Add yourself as a test user if prompted.
4. **Create Credentials**:
   - Go to "APIs & Services" > "Credentials".
   - Click "Create Credentials" > "OAuth client ID".
   - Select "Web application" for the Application type.
   - Name it "Birthday Greetings App Web Client".
   - Under "Authorized JavaScript origins", add `http://localhost:5173`.
   - Under "Authorized redirect URIs", add `http://localhost:5173`.
   - Click "Create".
5. **Get your Client ID**:
   - You will see a popup with your "Client ID". Copy this string.
6. **Update the App**:
   - Go back to your editor, open `src/main.tsx`.
   - Replace `"YOUR_GOOGLE_CLIENT_ID_HERE.apps.googleusercontent.com"` with your new Client ID.
   - Save the file and reload the application.

*Note: The project is free for personal use and you do not need to enter any payment information unless you scale to high usage.*

## Enabling Calendar & Contacts (required for real import/sync)

The app reads your Google Calendar events and Contacts using the access token from sign-in.
For these calls to succeed (otherwise Google returns **403 Forbidden**), you must:

1. **Enable the APIs** in your project:
   - Go to "APIs & Services" > "Library".
   - Search for **Google People API** and click **Enable**.
   - Search for **Google Calendar API** and click **Enable**.
2. **Add the scopes** to the OAuth consent screen (under "APIs & Services" > "OAuth consent screen" > "Data access" / Scopes):
   - `https://www.googleapis.com/auth/contacts.readonly`
   - `https://www.googleapis.com/auth/calendar.readonly`
3. **Add yourself as a test user** (if the app is in "Testing" publishing status) so Google lets you grant these scopes.

If a fetch fails with "session expired" (401), simply sign in again from the Settings tab — the
access token is short-lived by design and is never stored on any server.

## About Gemini (AI greetings)

Gemini is **not** covered by Google sign-in. Each user enters their own free Gemini API key
(Settings tab), created from their own account at [Google AI Studio](https://aistudio.google.com/).
The key is stored only on the user's device and is used against that user's own free quota — it is
never sent to any server you control. Use the **"בדוק/י מפתח" (Test key)** button to verify it works.
