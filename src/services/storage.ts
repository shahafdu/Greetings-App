import {
  isVaultEnabled,
  isVaultUnlocked,
  setupVaultKey,
  loadVaultKey,
  clearVaultKey,
  removeVault,
  encryptString,
  decryptString
} from './vault';
import { nextHebrewOccurrence, hebrewAnniversaryInGregYear } from './hebrewDate';

export interface Person {
  id: string;
  firstName: string;
  lastName?: string;
  eventDate: string; // YYYY-MM-DD
  // One of OCCASIONS, or any free-text value the user typed via the "אחר" option.
  occasion: string;
  relation: string;
  gender: 'Male' | 'Female' | 'Couple';
  phone?: string;
  notes?: string;
  notifyDaysBefore: number;
  notifyHour: string; // "HH:MM"
  isRecurring: boolean;
  recurrence: 'yearly' | 'monthly' | 'weekly' | 'once';
  useFirstNameOnly?: boolean;
  // Proxy delivery: address the greeting to someone else (a parent, a family WhatsApp
  // group, etc.) instead of the celebrant. Empty proxyName = sent directly to the celebrant.
  proxyName?: string;
  proxyGender?: 'Male' | 'Female' | 'Couple';
  celebrantRelationToProxy?: string; // free text describing the celebrant to the proxy, e.g. "הבן שלך"
  // If this event was imported from a synced calendar event, its source id. Used to hide that
  // event's dashed chip on the calendar — and to bring it back if this event is deleted.
  sourceEventId?: string;
  // Hebrew (Jewish) calendar date, auto-computed from eventDate but editable. Stored as
  // hebcal day + month numbers so the anniversary can recur on the Hebrew calendar.
  hebrewDay?: number;
  hebrewMonth?: number;
  // Born after sunset? The Hebrew day rolls over at nightfall, so this shifts the auto-computed
  // Hebrew date one day forward (can even change the Hebrew year near Rosh Hashana).
  hebrewAfterSunset?: boolean;
  // Which date(s) to greet on: Gregorian only (default), the Hebrew anniversary only, or both.
  dateMode?: 'gregorian' | 'hebrew' | 'both';
  // Deprecated: superseded by dateMode ('hebrew'). Kept so old saved events still work.
  useHebrewDate?: boolean;
  // Saved greeting drafts attached to this event. The user can save an edited/generated greeting
  // here to reuse later, and past drafts are fed back to the AI as style examples on regeneration.
  // Not exported by default (opt-in via the "include drafts" toggle).
  drafts?: GreetingDraft[];
}

// A saved greeting the user liked/edited. Attached to an event (Person.drafts) or kept in the
// standalone quick-generator drafts list (QuickDraft extends this).
export interface GreetingDraft {
  id: string;
  text: string;
  createdAt: number;
  // The tone/language the greeting was generated with, restored when the draft is loaded.
  tone?: 'normal' | 'funny' | 'emotional' | 'short';
  lang?: 'he' | 'en';
}

// A draft saved from the Quick Generator. Standalone (not tied to a stored event), so it also
// carries the form inputs needed to reload the generator with the same recipient details.
export interface QuickDraft extends GreetingDraft {
  firstName: string;
  lastName?: string;
  occasion: string;
  relation: string;
  gender: Person['gender'];
  years: number;
  useFirstNameOnly?: boolean;
  viaProxy?: boolean;
  proxyName?: string;
  proxyGender?: Person['gender'];
  celebrantLink?: string;
}

export type AiProvider = 'gemini' | 'groq' | 'openrouter' | 'proxy';

export interface AppSettings {
  // Which AI backend to use for greetings. Each is optional; without a key the app
  // falls back to the built-in Hebrew templates.
  aiProvider?: AiProvider;
  geminiApiKey: string;
  geminiModel?: string;
  groqApiKey?: string;
  groqModel?: string;
  openRouterApiKey?: string;
  openRouterModel?: string;
  // The gender of the *sender* (the app user writing the greeting). Hebrew first-person
  // verbs ("מאחל" vs "מאחלת") depend on it, so it must be set for correct grammar.
  senderGender?: 'Male' | 'Female';
  // The sender's name for signing greetings. senderName is the Hebrew form; senderNameEn is the
  // English form used when the greeting is generated in English (falls back to senderName).
  senderName?: string;
  senderNameEn?: string;
  // Where contacts/calendar are read from on a phone: the device, or the Google account.
  // (On the web only Google is available.)
  dataSource?: 'device' | 'google';
  useGoogleAuth: boolean;
  googleUserEmail?: string;
  googleUserName?: string;
  defaultNotifyHour: string;
  defaultNotifyDaysBefore: number;
  // Show Hebrew (Jewish) calendar dates alongside Gregorian on the calendar + event form.
  showHebrewDates?: boolean;
  // UI language. 'he' (Hebrew, RTL) by default; 'en' switches text + direction to LTR.
  language?: 'he' | 'en';
}

// Default to the built-in proxy so greetings use AI with no key. If the proxy URL is unset
// (open-source builds without a server), the app falls back to the local Hebrew templates.
export const DEFAULT_AI_PROVIDER: AiProvider = 'proxy';

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-lite';

// Models offered in Settings. Free-tier availability varies by account/region — if one
// returns a 429 "quota: 0", the user can switch to another here.
export const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite'
] as const;

export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b';

// Groq's free, OpenAI-compatible production models that work well for Hebrew.
// gpt-oss-120b is the strongest; the others are lighter fallbacks.
export const GROQ_MODELS = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant'
] as const;

export const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-oss-120b:free';

// Fallback list, used only if the live free-model list can't be fetched from OpenRouter.
// The real options are fetched at runtime (their slugs change often).
export const OPENROUTER_MODELS = [
  'openai/gpt-oss-120b:free',
  'openai/gpt-oss-20b:free',
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free'
] as const;

const PEOPLE_STORAGE_KEY = 'birthday_greetings_people';
const SETTINGS_STORAGE_KEY = 'birthday_greetings_settings';
const QUICK_DRAFTS_STORAGE_KEY = 'birthday_greetings_quick_drafts';

// Max drafts kept per event / in the quick list, so storage can't grow without bound.
export const MAX_DRAFTS_PER_EVENT = 20;
export const MAX_QUICK_DRAFTS = 50;

export const RELATIONS = [
  'בן/בת זוג',
  'בן/בת',
  'הורה',
  'אח/אחות',
  'סבא/סבתא',
  'נכד/ה',
  'דוד/דודה',
  'אחיין/ית',
  'בן/בת דוד/ה',
  'חם/חמות',
  'גיס/גיסה',
  'חבר/ה קרוב/ה',
  'חבר/ה',
  'קולגה',
  'שכן/ה',
  'אחר'
];

export const OCCASIONS = [
  'יום הולדת',
  'יום נישואין',
  'סיום לימודים',
  'קידום בעבודה',
  'הולדת תינוק/ת',
  'מעבר דירה',
  'חג שמח',
  'גיוס / שחרור',
  'אחר'
] as const;

// Helper to determine if a relationship is close, which warrants omitting surnames
export const isCloseRelation = (relation: string): boolean => {
  return [
    'בן/בת זוג', 'בן/בת', 'ילד/ה', 'הורה', 'אח/אחות',
    'סבא/סבתא', 'נכד/ה', 'דוד/דודה', 'אחיין/ית', 'בן/בת דוד/ה',
    'חם/חמות', 'גיס/גיסה', 'חבר/ה קרוב/ה'
  ].includes(relation);
};

// Categorize a relationship for color-coding in lists and the calendar.
export const getRelationCategory = (relation: string): 'spouse' | 'family' | 'friend' => {
  if (relation.includes('זוג') || relation.includes('Spouse')) return 'spouse';
  const familyTerms = ['בן', 'בת', 'ילד', 'הורה', 'אח', 'אחות', 'סב', 'נכד', 'דוד', 'אחיין', 'חם', 'גיס'];
  if (familyTerms.some(t => relation.includes(t))) return 'family';
  return 'friend';
};

// ---- In-memory cache + plain/encrypted persistence ----
// Data is held in memory while the app runs. When the App Lock is enabled it is persisted
// as a single encrypted blob; otherwise as the original plain localStorage keys.

const VAULT_DATA_KEY = 'birthday_greetings_vault_data';
// A redundant "last known good (non-empty)" copy of the events, used to self-heal if the
// primary store is ever emptied. Only written while unlocked/plaintext, and removed when
// the App Lock is enabled (so it never leaks past the encryption).
const PEOPLE_MIRROR_KEY = 'birthday_greetings_people_mirror';

let peopleCache: Person[] | null = null;
let settingsCache: AppSettings | null = null;
let quickDraftsCache: QuickDraft[] | null = null;

const migratePeople = (parsed: any[]): Person[] => parsed.filter(p => p && typeof p === 'object').map(p => {
  let firstName = p.firstName || '';
  let lastName = p.lastName || '';
  if (!firstName && p.name) {
    const parts = p.name.trim().split(/\s+/);
    firstName = parts[0];
    lastName = parts.slice(1).join(' ');
  }
  const relation = p.relation || 'חבר/ה';
  const useFirstNameOnly = p.useFirstNameOnly !== undefined ? p.useFirstNameOnly : isCloseRelation(relation);
  return {
    // Preserve every stored field (proxy delivery, sourceEventId, hebrewDay/Month, dateMode, …);
    // the explicit fields below only normalize/default the core ones.
    ...p,
    id: p.id || `person-${Date.now()}-${Math.random()}`,
    firstName: firstName || 'ללא שם',
    lastName: lastName || undefined,
    eventDate: p.eventDate || p.birthday || '1995-01-01',
    occasion: p.occasion || 'יום הולדת',
    relation,
    gender: p.gender || 'Male',
    phone: p.phone,
    notes: p.notes,
    notifyDaysBefore: p.notifyDaysBefore !== undefined ? p.notifyDaysBefore : 0,
    notifyHour: p.notifyHour || '09:00',
    isRecurring: p.isRecurring !== undefined ? p.isRecurring : (p.recurrence ? p.recurrence !== 'once' : true),
    recurrence: p.recurrence || 'yearly',
    useFirstNameOnly
  };
});

const applySettingsDefaults = (raw: Partial<AppSettings> | null): AppSettings => {
  const settings: AppSettings = raw && Object.keys(raw).length ? (raw as AppSettings) : {
    geminiApiKey: '',
    senderGender: 'Male',
    useGoogleAuth: false,
    defaultNotifyHour: '09:00',
    defaultNotifyDaysBefore: 0
  };
  if (!settings.aiProvider) settings.aiProvider = DEFAULT_AI_PROVIDER;
  // Reset to a valid default if the saved model is no longer offered (e.g. a retired model).
  if (!settings.geminiModel || !(GEMINI_MODELS as readonly string[]).includes(settings.geminiModel)) {
    settings.geminiModel = DEFAULT_GEMINI_MODEL;
  }
  if (!settings.groqModel || !(GROQ_MODELS as readonly string[]).includes(settings.groqModel)) {
    settings.groqModel = DEFAULT_GROQ_MODEL;
  }
  // OpenRouter's free models are fetched live (slugs change), so don't validate against a
  // static list — only fill a default when empty.
  if (!settings.openRouterModel) settings.openRouterModel = DEFAULT_OPENROUTER_MODEL;
  if (!settings.senderGender) settings.senderGender = 'Male';
  return settings;
};

// Read events from a JSON array, returning [] if it doesn't parse to a non-empty array.
const parsePeople = (raw: string | null): Person[] => {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? migratePeople(arr) : [];
  } catch {
    return [];
  }
};

const loadPlainPeople = (): Person[] => {
  const primary = parsePeople(localStorage.getItem(PEOPLE_STORAGE_KEY));
  if (primary.length > 0) {
    // Keep the self-heal mirror current so a recovery copy always exists.
    localStorage.setItem(PEOPLE_MIRROR_KEY, JSON.stringify(primary));
    return primary;
  }

  // Primary is empty/absent — self-heal from the mirror before giving up.
  const mirror = parsePeople(localStorage.getItem(PEOPLE_MIRROR_KEY));
  if (mirror.length > 0) {
    localStorage.setItem(PEOPLE_STORAGE_KEY, JSON.stringify(mirror));
    return mirror;
  }

  // Genuine first run (or legitimately empty): start with a clean, empty app — no sample data.
  return [];
};

// A corrupt/non-object settings value must never crash app start-up (that would lock the user
// out of their events) — fall back to defaults instead.
const loadPlainSettings = (): AppSettings => {
  let raw: Partial<AppSettings> | null = null;
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || 'null');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) raw = parsed;
  } catch {
    raw = null;
  }
  return applySettingsDefaults(raw);
};

// Persist the current caches. When the App Lock is enabled, data goes ONLY into the
// encrypted blob — never plaintext. When it's enabled but locked (no key in memory, e.g.
// after a hot-reload), we skip writing entirely so a stale/plaintext copy can't clobber it.
// Encrypted writes are async, so they are chained: each one snapshots the caches when it RUNS
// (not when it was queued) and they land strictly in order. Without this, two quick saves could
// finish out of order and an older snapshot would overwrite the newer one.
let encryptedWriteChain: Promise<void> = Promise.resolve();

const persist = (): void => {
  if (isVaultEnabled()) {
    if (isVaultUnlocked()) {
      encryptedWriteChain = encryptedWriteChain.then(async () => {
        // The lock may have been disabled (or the key dropped) while this write was queued.
        if (!isVaultEnabled() || !isVaultUnlocked()) return;
        const payload = JSON.stringify({ people: peopleCache || [], settings: settingsCache, quickDrafts: quickDraftsCache || [] });
        const blob = await encryptString(payload);
        if (isVaultEnabled() && isVaultUnlocked()) localStorage.setItem(VAULT_DATA_KEY, blob);
      }).catch(err => {
        console.error('Failed to persist encrypted data:', err instanceof Error ? err.message : err);
      });
    }
    return;
  }
  if (peopleCache) {
    localStorage.setItem(PEOPLE_STORAGE_KEY, JSON.stringify(peopleCache));
    // Keep the self-heal mirror in sync, but never overwrite it with an empty list.
    if (peopleCache.length > 0) localStorage.setItem(PEOPLE_MIRROR_KEY, JSON.stringify(peopleCache));
  }
  if (settingsCache) localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settingsCache));
  if (quickDraftsCache) localStorage.setItem(QUICK_DRAFTS_STORAGE_KEY, JSON.stringify(quickDraftsCache));
};

const parseQuickDrafts = (raw: string | null): QuickDraft[] => {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};

const loadPlainQuickDrafts = (): QuickDraft[] => parseQuickDrafts(localStorage.getItem(QUICK_DRAFTS_STORAGE_KEY));

// Call once on app start. Returns 'locked' if the App Lock is on and an unlock is needed;
// otherwise loads plain data into the caches and returns 'ready'.
export const initStorage = (): 'ready' | 'locked' => {
  if (isVaultEnabled()) return 'locked';
  peopleCache = loadPlainPeople();
  settingsCache = loadPlainSettings();
  quickDraftsCache = loadPlainQuickDrafts();
  return 'ready';
};

// Unlock the encrypted vault with a passphrase, decrypting data into the caches.
export const unlockStorage = async (passphrase: string): Promise<boolean> => {
  if (!(await loadVaultKey(passphrase))) return false;
  const blob = localStorage.getItem(VAULT_DATA_KEY);
  if (!blob) {
    // Vault enabled but no encrypted data (e.g. enabling the lock was interrupted before the
    // encrypted copy was written). Pick up any plaintext copy that is still there rather than
    // starting empty — starting empty would orphan the user's events. Never seed mock defaults.
    peopleCache = loadPlainPeople();
    settingsCache = loadPlainSettings();
    quickDraftsCache = loadPlainQuickDrafts();
    return true;
  }
  let plaintext: string;
  try {
    plaintext = await decryptString(blob);
  } catch {
    clearVaultKey(); // wrong passphrase: GCM decryption failed
    return false;
  }
  try {
    const data = JSON.parse(plaintext) as { people?: any[]; settings?: Partial<AppSettings>; quickDrafts?: QuickDraft[] };
    peopleCache = migratePeople(Array.isArray(data.people) ? data.people : []);
    settingsCache = applySettingsDefaults(data.settings && typeof data.settings === 'object' ? data.settings : null);
    quickDraftsCache = Array.isArray(data.quickDrafts) ? data.quickDrafts : [];
    return true;
  } catch {
    clearVaultKey();
    return false;
  }
};

// Turn on the App Lock: derive a key, encrypt the current data, delete the plaintext copies.
// The encrypted copy is written and confirmed BEFORE removing the plaintext, so there is no
// window where the data exists in neither place.
export const enableLock = async (passphrase: string): Promise<void> => {
  if (!peopleCache) peopleCache = loadPlainPeople();
  if (!settingsCache) settingsCache = loadPlainSettings();
  if (!quickDraftsCache) quickDraftsCache = loadPlainQuickDrafts();
  await setupVaultKey(passphrase);
  try {
    const payload = JSON.stringify({ people: peopleCache, settings: settingsCache, quickDrafts: quickDraftsCache });
    const blob = await encryptString(payload);
    localStorage.setItem(VAULT_DATA_KEY, blob);
    if (localStorage.getItem(VAULT_DATA_KEY) !== blob) {
      throw new Error('Failed to persist encrypted vault; keeping plaintext.');
    }
  } catch (err) {
    // Roll back to the plaintext state: otherwise the app would report "locked" with no
    // encrypted data behind it, and the (still present) plaintext would be ignored.
    localStorage.removeItem(VAULT_DATA_KEY);
    removeVault();
    throw err;
  }
  // Encrypted copy confirmed — now it is safe to delete the plaintext (incl. the mirror).
  localStorage.removeItem(PEOPLE_STORAGE_KEY);
  localStorage.removeItem(SETTINGS_STORAGE_KEY);
  localStorage.removeItem(PEOPLE_MIRROR_KEY);
  localStorage.removeItem(QUICK_DRAFTS_STORAGE_KEY);
};

// Turn off the App Lock: write the data back as plaintext and remove the vault.
// Only writes caches that are actually loaded, so it can never overwrite data with [].
export const disableLock = (): void => {
  if (peopleCache) {
    localStorage.setItem(PEOPLE_STORAGE_KEY, JSON.stringify(peopleCache));
    if (peopleCache.length > 0) localStorage.setItem(PEOPLE_MIRROR_KEY, JSON.stringify(peopleCache));
  }
  if (settingsCache) localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settingsCache));
  if (quickDraftsCache) localStorage.setItem(QUICK_DRAFTS_STORAGE_KEY, JSON.stringify(quickDraftsCache));
  localStorage.removeItem(VAULT_DATA_KEY);
  removeVault();
};

export const isLockEnabled = (): boolean => isVaultEnabled();

export const getPeople = (): Person[] => {
  if (peopleCache) return peopleCache;
  if (!isVaultEnabled()) {
    peopleCache = loadPlainPeople();
    return peopleCache;
  }
  return []; // locked and not yet unlocked
};

export const savePeople = (people: Person[]): void => {
  peopleCache = people;
  persist();
};

export const addPerson = (newPerson: Omit<Person, 'id'>): Person => {
  const person: Person = {
    ...newPerson,
    id: `person-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  };
  savePeople([...getPeople(), person]);
  return person;
};

export const updatePerson = (updatedPerson: Person): void => {
  const people = getPeople();
  const index = people.findIndex(p => p.id === updatedPerson.id);
  if (index !== -1) {
    const next = [...people];
    next[index] = updatedPerson;
    savePeople(next);
  }
};

export const deletePerson = (id: string): void => {
  savePeople(getPeople().filter(p => p.id !== id));
};

const makeDraftId = (): string => `draft-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// ---- Event-attached drafts (Feature 1) ----

export const getPersonDrafts = (personId: string): GreetingDraft[] =>
  getPeople().find(p => p.id === personId)?.drafts || [];

// Save a greeting as a draft on an event. Returns the updated person (or undefined if not found).
export const addPersonDraft = (
  personId: string,
  draft: Omit<GreetingDraft, 'id' | 'createdAt'>
): Person | undefined => {
  const people = getPeople();
  const index = people.findIndex(p => p.id === personId);
  if (index === -1) return undefined;
  const newDraft: GreetingDraft = { ...draft, id: makeDraftId(), createdAt: Date.now() };
  // Newest first, capped so storage can't grow without bound.
  const drafts = [newDraft, ...(people[index].drafts || [])].slice(0, MAX_DRAFTS_PER_EVENT);
  const updated = { ...people[index], drafts };
  const next = [...people];
  next[index] = updated;
  savePeople(next);
  return updated;
};

export const deletePersonDraft = (personId: string, draftId: string): Person | undefined => {
  const people = getPeople();
  const index = people.findIndex(p => p.id === personId);
  if (index === -1) return undefined;
  const updated = { ...people[index], drafts: (people[index].drafts || []).filter(d => d.id !== draftId) };
  const next = [...people];
  next[index] = updated;
  savePeople(next);
  return updated;
};

// ---- Quick-generator standalone drafts (Feature 2) ----

export const getQuickDrafts = (): QuickDraft[] => {
  if (quickDraftsCache) return quickDraftsCache;
  if (!isVaultEnabled()) {
    quickDraftsCache = loadPlainQuickDrafts();
    return quickDraftsCache;
  }
  return []; // locked and not yet unlocked
};

export const saveQuickDrafts = (drafts: QuickDraft[]): void => {
  quickDraftsCache = drafts;
  persist();
};

export const addQuickDraft = (draft: Omit<QuickDraft, 'id' | 'createdAt'>): QuickDraft => {
  const newDraft: QuickDraft = { ...draft, id: makeDraftId(), createdAt: Date.now() };
  saveQuickDrafts([newDraft, ...getQuickDrafts()].slice(0, MAX_QUICK_DRAFTS));
  return newDraft;
};

export const deleteQuickDraft = (id: string): void => {
  saveQuickDrafts(getQuickDrafts().filter(d => d.id !== id));
};

// Merge imported quick drafts into the existing list, de-duplicating by text (Feature 1 export).
export const mergeQuickDrafts = (incoming: QuickDraft[]): number => {
  if (!incoming.length) return 0;
  const existing = getQuickDrafts();
  const seen = new Set(existing.map(d => d.text.trim()));
  let added = 0;
  const merged = [...existing];
  incoming.forEach(d => {
    if (!d || !d.text || seen.has(d.text.trim())) return;
    merged.push({ ...d, id: d.id || makeDraftId(), createdAt: d.createdAt || Date.now() });
    seen.add(d.text.trim());
    added++;
  });
  if (added) saveQuickDrafts(merged.slice(0, MAX_QUICK_DRAFTS));
  return added;
};

export const getSettings = (): AppSettings => {
  if (settingsCache) return settingsCache;
  if (!isVaultEnabled()) {
    settingsCache = loadPlainSettings();
    return settingsCache;
  }
  return applySettingsDefaults(null); // locked — return defaults (no secrets)
};

export const saveSettings = (settings: AppSettings): void => {
  settingsCache = settings;
  persist();
};

const DAY_MS = 1000 * 60 * 60 * 24;

// Parse a stored YYYY-MM-DD as LOCAL midnight. `new Date('YYYY-MM-DD')` parses as UTC midnight,
// which is the previous calendar day in every timezone west of UTC — events would land a day
// early there. Falls back to the native parser for anything not in that shape.
export const parseLocalDate = (value: string): Date => {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(value || '');
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
};

// A date for (year, month, day) with the day clamped to the month's length, so the 31st of a
// 30-day month (or Feb 29 in a non-leap year) lands on the month's last day instead of
// overflowing into the next month.
const clampedDate = (year: number, month: number, day: number): Date =>
  new Date(year, month, Math.min(day, new Date(year, month + 1, 0).getDate()));

// Whole days between two local midnights (rounded, so a 23h/25h DST day still counts as one).
const daysBetween = (from: Date, to: Date): number => Math.round((to.getTime() - from.getTime()) / DAY_MS);

// Calculate age or years since start date, completed AS OF TODAY (current age).
export const calculateYears = (eventDateStr: string): number => {
  const eventDate = parseLocalDate(eventDateStr);
  if (isNaN(eventDate.getTime())) return 0;
  const today = new Date();
  let years = today.getFullYear() - eventDate.getFullYear();
  const m = today.getMonth() - eventDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < eventDate.getDate())) {
    years--;
  }
  return Math.max(0, years);
};

// The age / anniversary count the person (or couple) reaches at their NEXT occurrence of the
// event — the number that belongs in "Happy Nth birthday". calculateYears gives the CURRENT
// completed count as of today; for a yearly event whose date this year hasn't arrived yet, the
// celebration count is one higher (e.g. born 19/07/1989, on 18/07 they are 35 but turn 37 the
// next day). Non-yearly / one-time events fall back to the plain current count.
export const getCelebrationYears = (person: Person): number => {
  const birth = parseLocalDate(person.eventDate);
  if (isNaN(birth.getTime())) return 0;
  if (!person.isRecurring || person.recurrence !== 'yearly') {
    return calculateYears(person.eventDate);
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let next = clampedDate(today.getFullYear(), birth.getMonth(), birth.getDate());
  if (next < today) next = clampedDate(today.getFullYear() + 1, birth.getMonth(), birth.getDate());
  return Math.max(0, next.getFullYear() - birth.getFullYear());
};

// The age / anniversary count for the occurrence in a SPECIFIC Gregorian year — used on the
// calendar so an event reflects the age reached that year (last year's grid shows last year's
// age, next year's shows next year's). Returns null when the count isn't meaningful (non-yearly
// or one-time events).
export const getYearsForOccurrence = (person: Person, gregYear: number): number | null => {
  if (!person.isRecurring || person.recurrence !== 'yearly') return null;
  const birthYear = parseLocalDate(person.eventDate).getFullYear();
  if (isNaN(birthYear)) return null;
  return Math.max(0, gregYear - birthYear);
};

// Whether an event greets on the Gregorian date, the Hebrew date, or both.
// Back-compat: the old useHebrewDate boolean maps to 'hebrew'.
export const getDateMode = (person: Person): 'gregorian' | 'hebrew' | 'both' =>
  person.dateMode || (person.useHebrewDate ? 'hebrew' : 'gregorian');

// Does the event's GREGORIAN schedule (ignoring any Hebrew date) fall on the given day?
// The single source of truth for the "today" banner, the calendar grid and notifications.
export const gregorianOccursOn = (person: Person, date: Date): boolean => {
  const ev = parseLocalDate(person.eventDate);
  if (isNaN(ev.getTime())) return false;
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (d < ev) return false; // before the event's start date
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (!person.isRecurring || person.recurrence === 'once') return sameDay(ev, d);
  if (person.recurrence === 'weekly') return ev.getDay() === d.getDay();
  if (person.recurrence === 'monthly') return sameDay(clampedDate(d.getFullYear(), d.getMonth(), ev.getDate()), d);
  return sameDay(clampedDate(d.getFullYear(), ev.getMonth(), ev.getDate()), d);
};

// The next Gregorian occurrence on/after `today` (local midnight), or null for a one-time event
// that has already passed.
export const nextGregorianOccurrence = (person: Person, today: Date): Date | null => {
  const ev = parseLocalDate(person.eventDate);
  if (isNaN(ev.getTime())) return null;
  // An event whose start date is still ahead first occurs on that date.
  if (today < ev) return ev;
  if (!person.isRecurring || person.recurrence === 'once') {
    return ev.getTime() === today.getTime() ? ev : null;
  }
  if (person.recurrence === 'weekly') {
    const diff = (ev.getDay() - today.getDay() + 7) % 7;
    return new Date(today.getFullYear(), today.getMonth(), today.getDate() + diff);
  }
  if (person.recurrence === 'monthly') {
    const thisMonth = clampedDate(today.getFullYear(), today.getMonth(), ev.getDate());
    if (thisMonth >= today) return thisMonth;
    return clampedDate(today.getFullYear(), today.getMonth() + 1, ev.getDate());
  }
  const thisYear = clampedDate(today.getFullYear(), ev.getMonth(), ev.getDate());
  if (thisYear >= today) return thisYear;
  return clampedDate(today.getFullYear() + 1, ev.getMonth(), ev.getDate());
};

// For a given occurrence date, say whether it is the event's Hebrew anniversary, its Gregorian
// anniversary, or both fall on the same day. Returns null when there is no Hebrew/Gregorian
// distinction worth surfacing — i.e. the event has no Hebrew date, or it greets on the Gregorian
// calendar only (so every occurrence is trivially the Gregorian one). Callers still gate on the
// user's "show Hebrew dates" setting before displaying the result.
export const getOccurrenceDateKind = (
  person: Person,
  date: Date
): 'hebrew' | 'gregorian' | 'both' | null => {
  const mode = getDateMode(person);
  const hasHeb = !!(person.hebrewDay && person.hebrewMonth);
  if (!hasHeb || (mode !== 'hebrew' && mode !== 'both')) return null;

  const d = new Date(date);
  d.setHours(0, 0, 0, 0);

  const hebAnniv = hebrewAnniversaryInGregYear(person.hebrewDay!, person.hebrewMonth!, d.getFullYear());
  const hebMatch = !!hebAnniv && hebAnniv.getMonth() === d.getMonth() && hebAnniv.getDate() === d.getDate();

  // A Gregorian anniversary only co-exists when the event greets on both calendars.
  const gregMatch = mode === 'both' && gregorianOccursOn(person, d);

  if (hebMatch && gregMatch) return 'both';
  if (hebMatch) return 'hebrew';
  // Not the Hebrew anniversary: for a 'both' event this occurrence is the Gregorian one; for a
  // Hebrew-only event any real occurrence is the Hebrew date (fall back to that).
  return mode === 'both' ? 'gregorian' : 'hebrew';
};

// Days until the next Gregorian anniversary of the Hebrew date.
const hebrewDaysToEvent = (person: Person, today: Date): number =>
  daysBetween(today, nextHebrewOccurrence(person.hebrewDay!, person.hebrewMonth!, today));

// Gregorian days-to-next-occurrence; -1 for a one-time event that has already passed.
const gregorianDaysToEvent = (person: Person, today: Date): number => {
  const next = nextGregorianOccurrence(person, today);
  return next ? daysBetween(today, next) : -1;
};

// Days remaining until the next occurrence, respecting the event's dateMode
// (gregorian only / hebrew only / both — the sooner of the two).
export const getDaysToEvent = (person: Person): number => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const mode = getDateMode(person);
  const hasHeb = !!(person.hebrewDay && person.hebrewMonth);
  if (mode === 'hebrew' && hasHeb) return hebrewDaysToEvent(person, today);
  const gd = gregorianDaysToEvent(person, today);
  if (mode === 'both' && hasHeb) {
    const hd = hebrewDaysToEvent(person, today);
    const cands = [gd, hd].filter(x => x >= 0);
    return cands.length ? Math.min(...cands) : -1;
  }
  return gd;
};

// Check if an event is happening today
export const isEventToday = (person: Person): boolean => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const mode = getDateMode(person);
  const hasHeb = !!(person.hebrewDay && person.hebrewMonth);

  const hebToday = hasHeb &&
    nextHebrewOccurrence(person.hebrewDay!, person.hebrewMonth!, today).getTime() === today.getTime();
  if (mode === 'hebrew') return hebToday;

  const gregToday = gregorianOccursOn(person, today);
  if (mode === 'both') return gregToday || hebToday;
  return gregToday;
};

// Hebrew label for a gender value (Couple = a couple/group addressed in plural).
export const getGenderLabel = (gender: Person['gender']): string => {
  if (gender === 'Female') return 'נקבה';
  if (gender === 'Couple') return 'זוג / רבים';
  return 'זכר';
};

export const getOccasionEmoji = (occasion: Person['occasion']): string => {
  switch (occasion) {
    case 'יום הולדת': return '🎂';
    case 'יום נישואין': return '💍';
    case 'סיום לימודים': return '🎓';
    case 'קידום בעבודה': return '🚀';
    case 'הולדת תינוק/ת': return '👶';
    case 'מעבר דירה': return '🏠';
    case 'חג שמח': return '🍎';
    case 'גיוס / שחרור': return '🎖️';
    default: return '🎉';
  }
};
