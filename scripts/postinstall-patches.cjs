/*
 * Post-install patches applied to node_modules after every `npm install`.
 *
 * 1) @capacitor-community/contacts hardcodes its "contacts" permission alias to require BOTH
 *    READ_CONTACTS and WRITE_CONTACTS. This app only ever READS contacts, so we strip
 *    WRITE_CONTACTS — the app then needs only read permission. Idempotent (no-op if already done).
 */
const fs = require('fs');
const path = require('path');

const patches = [
  {
    name: '@capacitor-community/contacts → read-only',
    file: path.join(
      __dirname, '..', 'node_modules', '@capacitor-community', 'contacts',
      'android', 'src', 'main', 'java', 'getcapacitor', 'community', 'contacts', 'ContactsPlugin.java'
    ),
    from: 'permissions = { @Permission(strings = { Manifest.permission.READ_CONTACTS, Manifest.permission.WRITE_CONTACTS }, alias = "contacts") }',
    to: 'permissions = { @Permission(strings = { Manifest.permission.READ_CONTACTS }, alias = "contacts") }',
  },
];

for (const p of patches) {
  try {
    if (!fs.existsSync(p.file)) continue;
    const src = fs.readFileSync(p.file, 'utf8');
    if (src.includes(p.to) && !src.includes(p.from)) continue; // already patched
    if (src.includes(p.from)) {
      fs.writeFileSync(p.file, src.replace(p.from, p.to));
      console.log(`[postinstall-patch] applied: ${p.name}`);
    }
  } catch (e) {
    console.warn(`[postinstall-patch] skipped ${p.name}: ${e.message}`);
  }
}
