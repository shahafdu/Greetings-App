import { describe, it, expect } from 'vitest';
import { loadStorage, event, settle, K } from './helpers';

const stored = (key: string) => JSON.parse(localStorage.getItem(key) || 'null');

describe('plain storage', () => {
  it('keeps events across a restart', async () => {
    let st = await loadStorage();
    st.initStorage();
    st.addPerson(event({ firstName: 'A' }));
    st.addPerson(event({ firstName: 'B' }));
    const { vi } = await import('vitest');
    vi.resetModules();
    st = await loadStorage();
    expect(st.initStorage()).toBe('ready');
    expect(st.getPeople().map(p => p.firstName)).toEqual(['A', 'B']);
  });

  it('self-heals from the mirror when the primary store is wiped or corrupted', async () => {
    let st = await loadStorage();
    st.initStorage();
    st.addPerson(event({ firstName: 'A' }));
    const { vi } = await import('vitest');
    for (const damage of [() => localStorage.removeItem(K.people), () => localStorage.setItem(K.people, '[]'), () => localStorage.setItem(K.people, '{broken')]) {
      damage();
      vi.resetModules();
      st = await loadStorage();
      st.initStorage();
      expect(st.getPeople().map(p => p.firstName)).toEqual(['A']);
    }
  });

  it('deleting the last event stays deleted after a restart', async () => {
    let st = await loadStorage();
    st.initStorage();
    const a = st.addPerson(event({ firstName: 'A' }));
    const b = st.addPerson(event({ firstName: 'B' }));
    st.deletePerson(a.id);
    expect(stored(K.mirror)).toHaveLength(1); // mirror still protects the remaining event
    st.deletePerson(b.id);
    const { vi } = await import('vitest');
    vi.resetModules();
    st = await loadStorage();
    st.initStorage();
    expect(st.getPeople()).toEqual([]);
  });

  it('deleting an unknown id never clears the mirror', async () => {
    const st = await loadStorage();
    st.initStorage();
    st.addPerson(event({ firstName: 'A' }));
    st.deletePerson('nope');
    expect(stored(K.mirror)).toHaveLength(1);
    expect(st.getPeople()).toHaveLength(1);
  });

  it('survives corrupt settings and junk rows at start-up', async () => {
    localStorage.setItem(K.settings, '{not json');
    localStorage.setItem(K.people, JSON.stringify([null, 5, { id: 'c', firstName: 'Carmel', eventDate: '1980-03-04' }]));
    const st = await loadStorage();
    expect(st.initStorage()).toBe('ready');
    expect(st.getPeople().map(p => p.firstName)).toEqual(['Carmel']);
    expect(st.getSettings().defaultNotifyHour).toBe('09:00');
  });

  it('keeps saved drafts when an event is updated from the stored copy', async () => {
    const st = await loadStorage();
    st.initStorage();
    const p = st.addPerson(event());
    st.addPersonDraft(p.id, { text: 'saved' });
    const current = st.getPeople()[0];
    st.updatePerson({ ...current, lastName: 'Levi' });
    expect(st.getPeople()[0].drafts).toHaveLength(1);
  });
});

describe('App Lock', () => {
  it('leaves no plaintext behind and unlocks only with the right passphrase', async () => {
    let st = await loadStorage();
    st.initStorage();
    st.addPerson(event({ firstName: 'Secret' }));
    localStorage.setItem(K.googleToken, 'tok-123');
    await st.enableLock('correct horse');

    for (const key of [K.people, K.mirror, K.settings, K.quickDrafts, K.googleToken]) {
      expect(localStorage.getItem(key)).toBeNull();
    }
    const everything = Object.values(K).map(k => localStorage.getItem(k) || '').join('|');
    expect(everything).not.toContain('Secret');
    expect(everything).not.toContain('tok-123');
    expect(stored(K.vaultMeta).iterations).toBe(600000);

    const { vi } = await import('vitest');
    vi.resetModules();
    st = await loadStorage();
    expect(st.initStorage()).toBe('locked');
    expect(st.getPeople()).toEqual([]);
    expect(st.getGoogleToken()).toBeNull();
    expect(await st.unlockStorage('wrong pass')).toBe(false);
    expect(st.getPeople()).toEqual([]);
    expect(await st.unlockStorage('correct horse')).toBe(true);
    expect(st.getPeople().map(p => p.firstName)).toEqual(['Secret']);
    expect(st.getGoogleToken()).toBe('tok-123');
  });

  it('keeps every event when saves happen in quick succession', async () => {
    let st = await loadStorage();
    st.initStorage();
    await st.enableLock('correct horse');
    for (let i = 0; i < 12; i++) st.addPerson(event({ firstName: `P${i}` }));
    await settle();
    const { vi } = await import('vitest');
    vi.resetModules();
    st = await loadStorage();
    await st.unlockStorage('correct horse');
    expect(st.getPeople().map(p => p.firstName)).toEqual(Array.from({ length: 12 }, (_, i) => `P${i}`));
  });

  it('stores a Google token saved while locked-mode is on only inside the vault', async () => {
    let st = await loadStorage();
    st.initStorage();
    await st.enableLock('correct horse');
    st.saveGoogleToken('tok-new');
    await settle();
    expect(localStorage.getItem(K.googleToken)).toBeNull();
    const { vi } = await import('vitest');
    vi.resetModules();
    st = await loadStorage();
    await st.unlockStorage('correct horse');
    expect(st.getGoogleToken()).toBe('tok-new');
    st.saveGoogleToken(null);
    await settle();
    vi.resetModules();
    st = await loadStorage();
    await st.unlockStorage('correct horse');
    expect(st.getGoogleToken()).toBeNull();
  });

  it('moves a plaintext token left by an older version into the vault on unlock', async () => {
    let st = await loadStorage();
    st.initStorage();
    await st.enableLock('correct horse');
    localStorage.setItem(K.googleToken, 'tok-old'); // what an older build would have left
    const { vi } = await import('vitest');
    vi.resetModules();
    st = await loadStorage();
    await st.unlockStorage('correct horse');
    await settle();
    expect(st.getGoogleToken()).toBe('tok-old');
    expect(localStorage.getItem(K.googleToken)).toBeNull();
  });

  it('restores plaintext (and the token) when the lock is turned off', async () => {
    const st = await loadStorage();
    st.initStorage();
    st.addPerson(event({ firstName: 'A' }));
    localStorage.setItem(K.googleToken, 'tok-123');
    await st.enableLock('correct horse');
    st.disableLock();
    await settle();
    expect(stored(K.people)).toHaveLength(1);
    expect(localStorage.getItem(K.googleToken)).toBe('tok-123');
    expect(localStorage.getItem(K.vaultMeta)).toBeNull();
    expect(localStorage.getItem(K.vaultData)).toBeNull();
  });

  it('still unlocks a vault created with the old 200k-iteration setting', async () => {
    const enc = new TextEncoder();
    const b64 = (u: ArrayBuffer | Uint8Array) => Buffer.from(u instanceof Uint8Array ? u : new Uint8Array(u)).toString('base64');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const base = await crypto.subtle.importKey('raw', enc.encode('oldpw'), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify({ people: [{ id: 'L', firstName: 'Legacy', eventDate: '1980-03-04' }] })));
    localStorage.setItem(K.vaultMeta, JSON.stringify({ salt: b64(salt) }));
    localStorage.setItem(K.vaultData, `${b64(iv)}:${b64(ct)}`);
    const st = await loadStorage();
    expect(await st.unlockStorage('oldpw')).toBe(true);
    expect(st.getPeople()[0].firstName).toBe('Legacy');
  });

  it('recovers plaintext events if enabling the lock was interrupted', async () => {
    localStorage.setItem(K.vaultMeta, JSON.stringify({ salt: 'AAAAAAAAAAAAAAAAAAAAAA==', iterations: 600000 }));
    localStorage.setItem(K.people, JSON.stringify([{ id: 'O', firstName: 'Orphan', eventDate: '1980-03-04' }]));
    const st = await loadStorage();
    expect(st.initStorage()).toBe('locked');
    expect(await st.unlockStorage('anything')).toBe(true);
    expect(st.getPeople()[0].firstName).toBe('Orphan');
  });
});
