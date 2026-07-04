// Encrypted event sharing. Selected events are bundled and encrypted with a short code
// (PBKDF2 + AES-GCM), producing a text blob written to a file. The recipient enters the same
// code (sent out-of-band) to decrypt and merge. Device-specific fields are stripped so events
// migrate cleanly to another device or person (a phone number is plain, portable data).

import type { Person, AppSettings } from './storage';

// Settings safe to carry in a full backup (AI keys + preferences). The Google sign-in session is
// intentionally excluded — you re-connect Google on the new device.
export const pickBackupSettings = (s: AppSettings): Partial<AppSettings> => {
  const { useGoogleAuth: _a, googleUserEmail: _b, googleUserName: _c, ...rest } = s;
  void _a; void _b; void _c;
  return rest;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const SHARE_MAGIC = 'MTB1';    // payload = plain JSON (legacy backups)
const SHARE_MAGIC_GZ = 'MTB2'; // payload = gzip-compressed JSON

const toB64 = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};
const fromB64 = (s: string): Uint8Array => {
  const noPad = s.replace(/=+$/, '');
  const padded = noPad + '='.repeat((4 - (noPad.length % 4)) % 4); // tolerate lost padding
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
};

// gzip via the platform Compression Streams API (present in modern browsers/WebViews). If it's
// unavailable we simply skip compression and fall back to the plain (MTB1) format.
const hasGzip = typeof (globalThis as { CompressionStream?: unknown }).CompressionStream !== 'undefined';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pipe = async (bytes: Uint8Array, transform: any): Promise<Uint8Array> => {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream as ReadableStream).arrayBuffer());
};
const gzip = (bytes: Uint8Array): Promise<Uint8Array> => pipe(bytes, new CompressionStream('gzip'));
const gunzip = (bytes: Uint8Array): Promise<Uint8Array> => pipe(bytes, new DecompressionStream('gzip'));

const deriveKey = async (code: string, salt: Uint8Array): Promise<CryptoKey> => {
  const baseKey = await crypto.subtle.importKey('raw', encoder.encode(code), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 200000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

// A short, unambiguous share code (excludes easily-confused characters).
export const generateShareCode = (): string => {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
};

// The portable form of an event: drop the local id and the calendar-sync link.
export type PortableEvent = Omit<Person, 'id' | 'sourceEventId'>;

const toPortable = (p: Person): PortableEvent => {
  const { id: _id, sourceEventId: _s, ...rest } = p;
  void _id; void _s;
  return rest;
};

export interface DecryptedBundle {
  events: PortableEvent[];
  settings?: Partial<AppSettings>; // present only in a full backup
}

export const encryptEvents = async (
  events: Person[], code: string, settings?: Partial<AppSettings>
): Promise<string> => {
  const payload = JSON.stringify({ v: 1, events: events.map(toPortable), settings });
  // Compress before encrypting so the shared blob/file stays small (gzip, when supported).
  let body: Uint8Array = encoder.encode(payload);
  let magic = SHARE_MAGIC;
  if (hasGzip) { body = await gzip(body); magic = SHARE_MAGIC_GZ; }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(code, salt);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource }, key, body as BufferSource
  );
  return `${magic}.${toB64(salt)}.${toB64(iv)}.${toB64(ct)}`;
};

export const decryptEvents = async (blob: string, code: string): Promise<DecryptedBundle> => {
  // Messaging apps (esp. from an RTL app) can inject whitespace and invisible bidi/zero-width
  // marks around pasted text, which would break the base64 decode. Strip anything that isn't
  // part of the format (base64 chars + the '.' separators).
  const clean = (blob || '').replace(/[^A-Za-z0-9+/=.]/g, '');
  const parts = clean.split('.');
  if (parts.length !== 4 || (parts[0] !== SHARE_MAGIC && parts[0] !== SHARE_MAGIC_GZ)) throw new Error('קובץ שיתוף לא תקין.');
  // Valid base64 never has a segment length ≡ 1 (mod 4). If it does, the text was cut off
  // mid-way (messaging apps can truncate long pasted text) — tell the user to use the file.
  for (const seg of parts.slice(1)) {
    if (seg.replace(/=+$/, '').length % 4 === 1) {
      throw new Error('הטקסט חלקי — כנראה נחתך בשיתוף. השתמש/י בקובץ הגיבוי במקום הדבקת טקסט.');
    }
  }
  const [, saltB64, ivB64, ctB64] = parts;
  const key = await deriveKey(code.trim().toUpperCase(), fromB64(saltB64));
  let pt: ArrayBuffer;
  try {
    pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(ivB64) as BufferSource }, key, fromB64(ctB64) as BufferSource
    );
  } catch {
    throw new Error('הקוד שגוי או שהקובץ פגום.');
  }
  const bytes = parts[0] === SHARE_MAGIC_GZ ? await gunzip(new Uint8Array(pt)) : new Uint8Array(pt);
  const data = JSON.parse(decoder.decode(bytes)) as { events?: PortableEvent[]; settings?: Partial<AppSettings> };
  return { events: data.events || [], settings: data.settings };
};
