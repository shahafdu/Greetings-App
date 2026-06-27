// App Lock: passphrase-derived AES-GCM encryption for data at rest.
//
// Design: a random AES-GCM key is derived from the user's passphrase via PBKDF2 (with a
// per-install random salt). The key lives only in memory for the session and is never
// stored. When the lock is enabled, the app's data is kept in localStorage as ciphertext;
// without the passphrase it cannot be read. This is the same model that maps onto the
// Android Keystore + biometric unlock later (the key is simply released by the keystore
// after a fingerprint instead of derived from a typed passphrase).
//
// Caveat by design: because the key is derived from the passphrase and never stored, a
// forgotten passphrase means the local data is unrecoverable.

const VAULT_META_KEY = 'birthday_greetings_vault_meta'; // { salt: base64 }

let activeKey: CryptoKey | null = null;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toB64 = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

const fromB64 = (s: string): Uint8Array => Uint8Array.from(atob(s), c => c.charCodeAt(0));

const deriveKey = async (passphrase: string, salt: Uint8Array): Promise<CryptoKey> => {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 200000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

// Whether the App Lock has been set up (data is stored encrypted).
export const isVaultEnabled = (): boolean => !!localStorage.getItem(VAULT_META_KEY);

// Whether the vault key is currently loaded in memory (i.e. unlocked this session).
export const isVaultUnlocked = (): boolean => activeKey !== null;

// Set up the lock for the first time: generate a salt and derive+hold the key.
export const setupVaultKey = async (passphrase: string): Promise<void> => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  activeKey = await deriveKey(passphrase, salt);
  localStorage.setItem(VAULT_META_KEY, JSON.stringify({ salt: toB64(salt) }));
};

// Derive and hold the key from a passphrase using the stored salt. Does not verify the
// passphrase by itself — verification happens when decrypting real data (GCM auth tag).
export const loadVaultKey = async (passphrase: string): Promise<boolean> => {
  const meta = localStorage.getItem(VAULT_META_KEY);
  if (!meta) return false;
  try {
    const { salt } = JSON.parse(meta) as { salt: string };
    activeKey = await deriveKey(passphrase, fromB64(salt));
    return true;
  } catch {
    return false;
  }
};

export const clearVaultKey = (): void => {
  activeKey = null;
};

export const removeVault = (): void => {
  localStorage.removeItem(VAULT_META_KEY);
  activeKey = null;
};

export const encryptString = async (plaintext: string): Promise<string> => {
  if (!activeKey) throw new Error('vault locked');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, activeKey, encoder.encode(plaintext) as BufferSource);
  return `${toB64(iv)}:${toB64(ct)}`;
};

export const decryptString = async (blob: string): Promise<string> => {
  if (!activeKey) throw new Error('vault locked');
  const [ivB64, ctB64] = blob.split(':');
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(ivB64) as BufferSource },
    activeKey,
    fromB64(ctB64) as BufferSource
  );
  return decoder.decode(pt);
};
