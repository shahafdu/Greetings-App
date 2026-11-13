import { describe, it, expect } from 'vitest';
import { generateShareCode, encryptEvents, decryptEvents } from '../src/services/share';
import { person } from './helpers';
import type { QuickDraft } from '../src/services/storage';

// Build a share file by hand (legacy MTB1 format), to feed the importer arbitrary content.
const craft = async (payload: unknown, code: string): Promise<string> => {
  const enc = new TextEncoder();
  const b64 = (u: ArrayBuffer | Uint8Array) => Buffer.from(u instanceof Uint8Array ? u : new Uint8Array(u)).toString('base64');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const base = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(payload)));
  return `MTB1.${b64(salt)}.${b64(iv)}.${b64(ct)}`;
};

describe('share codes', () => {
  it('are 10 characters from the unambiguous alphabet', () => {
    for (let i = 0; i < 50; i++) expect(generateShareCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/);
  });
});

describe('share file round trip', () => {
  it('exports and imports events, drafts and settings', async () => {
    const code = generateShareCode();
    const quick: QuickDraft = { id: 'q', text: 'quick', createdAt: 1, firstName: 'x', occasion: 'o', relation: 'r', gender: 'Male', years: 3 };
    const blob = await encryptEvents(
      [person({ lastName: 'כהן', notifyHour: '00:30', hebrewDay: 9, hebrewMonth: 2, dateMode: 'both', sourceEventId: 'cal-1', drafts: [{ id: 'd', text: 'hi', createdAt: 5, tone: 'funny', lang: 'he' }] })],
      code,
      { groqApiKey: 'k', aiProvider: 'groq' },
      { includeDrafts: true, quickDrafts: [quick] }
    );
    // Pasted text picks up whitespace/bidi marks; codes get typed in lower case with a dash.
    const out = await decryptEvents(`‏ ${blob}\n`, ` ${code.toLowerCase().slice(0, 5)}-${code.toLowerCase().slice(5)} `);
    const e = out.events[0];
    expect(out.events).toHaveLength(1);
    expect(e).toMatchObject({ firstName: 'דנה', lastName: 'כהן', eventDate: '1990-05-04', notifyHour: '00:30', hebrewDay: 9, hebrewMonth: 2, dateMode: 'both' });
    expect(e.drafts?.[0]).toMatchObject({ text: 'hi', tone: 'funny', lang: 'he' });
    expect(e).not.toHaveProperty('id');
    expect(e).not.toHaveProperty('sourceEventId');
    expect(out.settings).toEqual({ groqApiKey: 'k', aiProvider: 'groq' });
    expect(out.quickDrafts).toHaveLength(1);
  });

  it('leaves drafts out unless asked', async () => {
    const code = generateShareCode();
    const blob = await encryptEvents([person({ drafts: [{ id: 'd', text: 'private', createdAt: 5 }] })], code);
    const out = await decryptEvents(blob, code);
    expect(out.events[0].drafts).toBeUndefined();
    expect(out.settings).toBeUndefined();
  });

  it('rejects a wrong code, a truncated file and a non-share file', async () => {
    const code = generateShareCode();
    const blob = await encryptEvents([person()], code);
    await expect(decryptEvents(blob, 'AAAAAAAAAA')).rejects.toThrow('הקוד שגוי');
    await expect(decryptEvents(blob.slice(0, blob.length - 3), code)).rejects.toThrow();
    await expect(decryptEvents('hello world', code)).rejects.toThrow('קובץ שיתוף לא תקין');
  });

  it('still imports an old file with a 6-character code', async () => {
    const blob = await craft({ v: 1, events: [{ firstName: 'Old', eventDate: '2001-02-03' }] }, 'ABC234');
    expect((await decryptEvents(blob, 'abc234')).events[0].firstName).toBe('Old');
  });
});

describe('importing untrusted files', () => {
  it('drops malformed events and coerces bad fields to safe defaults', async () => {
    const blob = await craft({
      v: 1,
      events: [
        { firstName: { a: 1 }, eventDate: '2020-01-01' },
        null,
        'x',
        { firstName: 'BadDate', eventDate: '2020-13-45' },
        { firstName: 'Good', eventDate: '2020-02-03', relation: 5, notes: { x: 1 }, gender: 'Alien', id: 'evil', sourceEventId: 's', drafts: 'nope', notifyHour: '99:99', recurrence: 'hourly', notifyDaysBefore: -4, extra: '<script>' },
      ],
    }, 'ABC234');
    const { events } = await decryptEvents(blob, 'ABC234');
    expect(events).toEqual([{
      firstName: 'Good', eventDate: '2020-02-03', occasion: 'יום הולדת', relation: 'חבר/ה', gender: 'Male',
      notifyDaysBefore: 0, notifyHour: '09:00', isRecurring: true, recurrence: 'yearly',
    }]);
  });

  it('only accepts known settings, and never the Google session', async () => {
    const blob = await craft({
      v: 1, events: [],
      settings: { useGoogleAuth: true, googleUserEmail: 'a@b', googleUserName: 'n', aiProvider: 'evil', groqApiKey: 123, senderName: 'S', language: 'en', junk: 1 },
      quickDrafts: [{ text: 5 }, { text: 'ok', gender: 'x', years: 'many' }],
    }, 'ABC234');
    const out = await decryptEvents(blob, 'ABC234');
    expect(out.settings).toEqual({ senderName: 'S', language: 'en' });
    expect(out.quickDrafts).toHaveLength(1);
    expect(out.quickDrafts![0]).toMatchObject({ text: 'ok', gender: 'Male', years: 0 });
  });

  it('refuses an oversized file', async () => {
    await expect(decryptEvents('A'.repeat(9 * 1024 * 1024), 'ABC234')).rejects.toThrow('גדול מדי');
  });
});
