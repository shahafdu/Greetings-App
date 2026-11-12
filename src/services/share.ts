// Encrypted event sharing. Selected events are bundled and encrypted with a short code
// (PBKDF2 + AES-GCM), producing a text blob written to a file. The recipient enters the same
// code (sent out-of-band) to decrypt and merge. Device-specific fields are stripped so events
// migrate cleanly to another device or person (a phone number is plain, portable data).

import type { Person, AppSettings, QuickDraft, GreetingDraft } from './storage';

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

// Limits on what an imported file may contain. A share file comes from someone else, so it is
// untrusted input even after it decrypts: cap its size (incl. after decompression, so a tiny
// "zip bomb" can't exhaust memory) and the number of records it can add.
const MAX_BLOB_CHARS = 8 * 1024 * 1024;
const MAX_DECOMPRESSED_BYTES = 32 * 1024 * 1024;
const MAX_IMPORT_EVENTS = 5000;
const MAX_IMPORT_DRAFTS = 50;

const gunzip = async (bytes: Uint8Array): Promise<Uint8Array> => {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  const reader = (stream as ReadableStream<Uint8Array>).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_DECOMPRESSED_BYTES) {
      await reader.cancel();
      throw new Error('קובץ השיתוף גדול מדי.');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.length; }
  return out;
};

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

// A short, unambiguous share code (excludes easily-confused characters). The code is the ONLY
// secret protecting the file, and the file can be attacked offline, so it needs real entropy:
// 10 characters from a 31-letter alphabet is ~49.5 bits (the previous 6 characters were ~30 bits,
// brute-forceable in hours). Rejection sampling keeps every character uniformly likely.
const SHARE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const SHARE_CODE_LENGTH = 10;
export const generateShareCode = (): string => {
  const n = SHARE_CODE_ALPHABET.length;
  const limit = 256 - (256 % n); // bytes >= limit would bias the low letters
  let code = '';
  while (code.length < SHARE_CODE_LENGTH) {
    for (const b of crypto.getRandomValues(new Uint8Array(SHARE_CODE_LENGTH * 2))) {
      if (b < limit && code.length < SHARE_CODE_LENGTH) code += SHARE_CODE_ALPHABET[b % n];
    }
  }
  return code;
};

// ---- Validation of imported (untrusted) data ----
// Everything read from a share file is coerced to the exact shape the app expects. Unknown
// fields are dropped and wrong types are discarded, so a malformed or hostile file can't crash
// the UI (which would otherwise persist and re-crash on every launch) or smuggle in settings.

const str = (v: unknown, max: number): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
const int = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : undefined;
const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);

const GENDERS = ['Male', 'Female', 'Couple'] as const;
const TONES = ['normal', 'funny', 'emotional', 'short'] as const;
const LANGS = ['he', 'en'] as const;
const MAX_GREETING_LEN = 5000;

const isRealDate = (v: unknown): v is string => {
  if (typeof v !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
};

const sanitizeDraft = (raw: unknown): GreetingDraft | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const text = str(r.text, MAX_GREETING_LEN);
  if (!text) return null;
  return {
    id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    text,
    createdAt: typeof r.createdAt === 'number' && Number.isFinite(r.createdAt) && r.createdAt > 0 ? r.createdAt : Date.now(),
    tone: oneOf(r.tone, TONES),
    lang: oneOf(r.lang, LANGS)
  };
};

const sanitizeDrafts = (raw: unknown): GreetingDraft[] =>
  (Array.isArray(raw) ? raw : [])
    .slice(0, MAX_IMPORT_DRAFTS)
    .map(sanitizeDraft)
    .filter((d): d is GreetingDraft => d !== null);

const sanitizeEvent = (raw: unknown): PortableEvent | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const firstName = str(r.firstName, 100);
  if (!firstName || !isRealDate(r.eventDate)) return null;
  const recurrence = oneOf(r.recurrence, ['yearly', 'monthly', 'weekly', 'once'] as const) || 'yearly';
  const hebrewDay = int(r.hebrewDay, 1, 30);
  const hebrewMonth = int(r.hebrewMonth, 1, 13);
  const hasHebrew = hebrewDay !== undefined && hebrewMonth !== undefined;
  const legacyHebrew = r.useHebrewDate === true ? 'hebrew' : undefined;
  const proxyName = str(r.proxyName, 100);
  const drafts = sanitizeDrafts(r.drafts);
  const event: PortableEvent = {
    firstName,
    lastName: str(r.lastName, 100),
    eventDate: r.eventDate,
    occasion: str(r.occasion, 100) || 'יום הולדת',
    relation: str(r.relation, 100) || 'חבר/ה',
    gender: oneOf(r.gender, GENDERS) || 'Male',
    phone: str(r.phone, 40),
    notes: str(r.notes, 2000),
    notifyDaysBefore: int(r.notifyDaysBefore, 0, 365) ?? 0,
    notifyHour: typeof r.notifyHour === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.notifyHour) ? r.notifyHour : '09:00',
    isRecurring: recurrence !== 'once' && r.isRecurring !== false,
    recurrence: r.isRecurring === false ? 'once' : recurrence,
    useFirstNameOnly: bool(r.useFirstNameOnly),
    proxyName,
    proxyGender: proxyName ? oneOf(r.proxyGender, GENDERS) : undefined,
    celebrantRelationToProxy: proxyName ? str(r.celebrantRelationToProxy, 100) : undefined,
    hebrewDay: hasHebrew ? hebrewDay : undefined,
    hebrewMonth: hasHebrew ? hebrewMonth : undefined,
    hebrewAfterSunset: bool(r.hebrewAfterSunset),
    dateMode: hasHebrew ? (oneOf(r.dateMode, ['gregorian', 'hebrew', 'both'] as const) || legacyHebrew) : undefined
  };
  if (drafts.length) event.drafts = drafts;
  return event;
};

const sanitizeQuickDraft = (raw: unknown): QuickDraft | null => {
  const base = sanitizeDraft(raw);
  if (!base) return null;
  const r = raw as Record<string, unknown>;
  const proxyName = str(r.proxyName, 100);
  return {
    ...base,
    firstName: str(r.firstName, 100) || 'ללא שם',
    lastName: str(r.lastName, 100),
    occasion: str(r.occasion, 100) || 'יום הולדת',
    relation: str(r.relation, 100) || 'חבר/ה',
    gender: oneOf(r.gender, GENDERS) || 'Male',
    years: int(r.years, 0, 150) ?? 0,
    useFirstNameOnly: bool(r.useFirstNameOnly),
    viaProxy: bool(r.viaProxy),
    proxyName,
    proxyGender: proxyName ? oneOf(r.proxyGender, GENDERS) : undefined,
    celebrantLink: proxyName ? str(r.celebrantLink, 100) : undefined
  };
};

// Only the known backup settings, each type-checked. Anything else in the file is ignored, and
// the Google session fields can never be set from a file.
const sanitizeSettings = (raw: unknown): Partial<AppSettings> | undefined => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const candidate: Partial<AppSettings> = {
    aiProvider: oneOf(r.aiProvider, ['gemini', 'groq', 'openrouter', 'proxy'] as const),
    geminiApiKey: str(r.geminiApiKey, 300),
    geminiModel: str(r.geminiModel, 100),
    groqApiKey: str(r.groqApiKey, 300),
    groqModel: str(r.groqModel, 100),
    openRouterApiKey: str(r.openRouterApiKey, 300),
    openRouterModel: str(r.openRouterModel, 150),
    senderGender: oneOf(r.senderGender, ['Male', 'Female'] as const),
    senderName: str(r.senderName, 100),
    senderNameEn: str(r.senderNameEn, 100),
    dataSource: oneOf(r.dataSource, ['device', 'google'] as const),
    defaultNotifyHour: typeof r.defaultNotifyHour === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.defaultNotifyHour) ? r.defaultNotifyHour : undefined,
    defaultNotifyDaysBefore: int(r.defaultNotifyDaysBefore, 0, 365),
    showHebrewDates: bool(r.showHebrewDates),
    language: oneOf(r.language, LANGS)
  };
  const out = Object.fromEntries(Object.entries(candidate).filter(([, v]) => v !== undefined)) as Partial<AppSettings>;
  return Object.keys(out).length ? out : undefined;
};

// The portable form of an event: drop the local id and the calendar-sync link.
export type PortableEvent = Omit<Person, 'id' | 'sourceEventId'>;

// Saved greeting drafts are personal notes, not shared by default (Feature 1). They travel only
// when the user opts in via includeDrafts — otherwise we strip them from each exported event.
const toPortable = (p: Person, includeDrafts: boolean): PortableEvent => {
  const { id: _id, sourceEventId: _s, drafts, ...rest } = p;
  void _id; void _s;
  return includeDrafts ? { ...rest, drafts } : rest;
};

export interface DecryptedBundle {
  events: PortableEvent[];
  settings?: Partial<AppSettings>; // present only in a full backup
  quickDrafts?: QuickDraft[];      // present only when the sender opted to include drafts
}

export const encryptEvents = async (
  events: Person[],
  code: string,
  settings?: Partial<AppSettings>,
  opts?: { includeDrafts?: boolean; quickDrafts?: QuickDraft[] }
): Promise<string> => {
  const includeDrafts = !!opts?.includeDrafts;
  const payload = JSON.stringify({
    v: 1,
    events: events.map(e => toPortable(e, includeDrafts)),
    settings,
    quickDrafts: includeDrafts ? (opts?.quickDrafts || []) : undefined
  });
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
  if ((blob || '').length > MAX_BLOB_CHARS) throw new Error('קובץ השיתוף גדול מדי.');
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
  let pt: ArrayBuffer;
  try {
    // Tolerate spaces/dashes and invisible marks around a typed or pasted code.
    const key = await deriveKey(code.toUpperCase().replace(/[^A-Z0-9]/g, ''), fromB64(saltB64));
    pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(ivB64) as BufferSource }, key, fromB64(ctB64) as BufferSource
    );
  } catch {
    throw new Error('הקוד שגוי או שהקובץ פגום.');
  }
  let data: { events?: unknown; settings?: unknown; quickDrafts?: unknown };
  try {
    const bytes = parts[0] === SHARE_MAGIC_GZ ? await gunzip(new Uint8Array(pt)) : new Uint8Array(pt);
    data = JSON.parse(decoder.decode(bytes));
  } catch (err) {
    if (err instanceof Error && err.message === 'קובץ השיתוף גדול מדי.') throw err;
    throw new Error('קובץ שיתוף לא תקין.', { cause: err });
  }
  if (!data || typeof data !== 'object') throw new Error('קובץ שיתוף לא תקין.');
  const events = (Array.isArray(data.events) ? data.events : [])
    .slice(0, MAX_IMPORT_EVENTS)
    .map(sanitizeEvent)
    .filter((e): e is PortableEvent => e !== null);
  const quickDrafts = (Array.isArray(data.quickDrafts) ? data.quickDrafts : [])
    .slice(0, MAX_IMPORT_DRAFTS)
    .map(sanitizeQuickDraft)
    .filter((d): d is QuickDraft => d !== null);
  return { events, settings: sanitizeSettings(data.settings), quickDrafts: quickDrafts.length ? quickDrafts : undefined };
};
