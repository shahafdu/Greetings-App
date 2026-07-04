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
import { nextHebrewOccurrence } from './hebrewDate';

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

const migratePeople = (parsed: any[]): Person[] => parsed.map(p => {
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

const loadPlainSettings = (): AppSettings =>
  applySettingsDefaults(localStorage.getItem(SETTINGS_STORAGE_KEY) ? JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)!) : null);

// Persist the current caches. When the App Lock is enabled, data goes ONLY into the
// encrypted blob — never plaintext. When it's enabled but locked (no key in memory, e.g.
// after a hot-reload), we skip writing entirely so a stale/plaintext copy can't clobber it.
const persist = (): void => {
  if (isVaultEnabled()) {
    if (isVaultUnlocked()) {
      const payload = JSON.stringify({ people: peopleCache || [], settings: settingsCache });
      void encryptString(payload).then(blob => localStorage.setItem(VAULT_DATA_KEY, blob));
    }
    return;
  }
  if (peopleCache) {
    localStorage.setItem(PEOPLE_STORAGE_KEY, JSON.stringify(peopleCache));
    // Keep the self-heal mirror in sync, but never overwrite it with an empty list.
    if (peopleCache.length > 0) localStorage.setItem(PEOPLE_MIRROR_KEY, JSON.stringify(peopleCache));
  }
  if (settingsCache) localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settingsCache));
};

// Call once on app start. Returns 'locked' if the App Lock is on and an unlock is needed;
// otherwise loads plain data into the caches and returns 'ready'.
export const initStorage = (): 'ready' | 'locked' => {
  if (isVaultEnabled()) return 'locked';
  peopleCache = loadPlainPeople();
  settingsCache = loadPlainSettings();
  return 'ready';
};

// Unlock the encrypted vault with a passphrase, decrypting data into the caches.
export const unlockStorage = async (passphrase: string): Promise<boolean> => {
  if (!(await loadVaultKey(passphrase))) return false;
  const blob = localStorage.getItem(VAULT_DATA_KEY);
  if (!blob) {
    // Vault enabled but no encrypted data: start empty. Do NOT seed mock defaults here —
    // that would later overwrite the encrypted store with mock data.
    peopleCache = [];
    settingsCache = applySettingsDefaults(null);
    return true;
  }
  try {
    const data = JSON.parse(await decryptString(blob)) as { people?: any[]; settings?: Partial<AppSettings> };
    peopleCache = migratePeople(data.people || []);
    settingsCache = applySettingsDefaults(data.settings || null);
    return true;
  } catch {
    clearVaultKey(); // wrong passphrase: GCM decryption failed
    return false;
  }
};

// Turn on the App Lock: derive a key, encrypt the current data, delete the plaintext copies.
// The encrypted copy is written and confirmed BEFORE removing the plaintext, so there is no
// window where the data exists in neither place.
export const enableLock = async (passphrase: string): Promise<void> => {
  if (!peopleCache) peopleCache = loadPlainPeople();
  if (!settingsCache) settingsCache = loadPlainSettings();
  await setupVaultKey(passphrase);
  const payload = JSON.stringify({ people: peopleCache, settings: settingsCache });
  const blob = await encryptString(payload);
  localStorage.setItem(VAULT_DATA_KEY, blob);
  if (!localStorage.getItem(VAULT_DATA_KEY)) {
    throw new Error('Failed to persist encrypted vault; keeping plaintext.');
  }
  // Encrypted copy confirmed — now it is safe to delete the plaintext (incl. the mirror).
  localStorage.removeItem(PEOPLE_STORAGE_KEY);
  localStorage.removeItem(SETTINGS_STORAGE_KEY);
  localStorage.removeItem(PEOPLE_MIRROR_KEY);
};

// Turn off the App Lock: write the data back as plaintext and remove the vault.
// Only writes caches that are actually loaded, so it can never overwrite data with [].
export const disableLock = (): void => {
  if (peopleCache) {
    localStorage.setItem(PEOPLE_STORAGE_KEY, JSON.stringify(peopleCache));
    if (peopleCache.length > 0) localStorage.setItem(PEOPLE_MIRROR_KEY, JSON.stringify(peopleCache));
  }
  if (settingsCache) localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settingsCache));
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

// Calculate age or years since start date
export const calculateYears = (eventDateStr: string): number => {
  const eventDate = new Date(eventDateStr);
  const today = new Date();
  let years = today.getFullYear() - eventDate.getFullYear();
  const m = today.getMonth() - eventDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < eventDate.getDate())) {
    years--;
  }
  return Math.max(0, years);
};

// Whether an event greets on the Gregorian date, the Hebrew date, or both.
// Back-compat: the old useHebrewDate boolean maps to 'hebrew'.
export const getDateMode = (person: Person): 'gregorian' | 'hebrew' | 'both' =>
  person.dateMode || (person.useHebrewDate ? 'hebrew' : 'gregorian');

// Days until the next Gregorian anniversary of the Hebrew date.
const hebrewDaysToEvent = (person: Person, today: Date): number => {
  const next = nextHebrewOccurrence(person.hebrewDay!, person.hebrewMonth!, today);
  return Math.round((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

// Gregorian days-to-next-occurrence (the original logic).
const gregorianDaysToEvent = (person: Person, today: Date): number => {
  const eventDate = new Date(person.eventDate);
  eventDate.setHours(0, 0, 0, 0);

  // If the event start date is in the future, return days until that date
  if (today < eventDate) {
    const diffTime = eventDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  if (!person.isRecurring || person.recurrence === 'once') {
    // One time event that has already passed or is today
    const targetDate = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
    if (targetDate < today) {
      // Already passed
      return -1; // Indicates past event
    }
    const diffTime = targetDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  if (person.recurrence === 'weekly') {
    // Weekly recurrence: next event occurs on the same day of week
    const targetDayOfWeek = eventDate.getDay();
    const todayDayOfWeek = today.getDay();
    let daysDiff = targetDayOfWeek - todayDayOfWeek;
    if (daysDiff < 0) {
      daysDiff += 7;
    }
    return daysDiff === 0 ? 0 : daysDiff;
  }

  if (person.recurrence === 'monthly') {
    // Monthly recurrence: next event occurs on the same day of month
    let targetMonth = today.getMonth();
    let targetYear = today.getFullYear();
    if (today.getDate() > eventDate.getDate()) {
      targetMonth++;
      if (targetMonth > 11) {
        targetMonth = 0;
        targetYear++;
      }
    }
    const nextEvent = new Date(targetYear, targetMonth, eventDate.getDate());
    const diffTime = nextEvent.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  // Default: yearly recurrence
  const nextEvent = new Date(today.getFullYear(), eventDate.getMonth(), eventDate.getDate());
  if (nextEvent < today) {
    nextEvent.setFullYear(today.getFullYear() + 1);
  }
  const diffTime = nextEvent.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
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
  const eventDate = new Date(person.eventDate);
  eventDate.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const mode = getDateMode(person);
  const hasHeb = !!(person.hebrewDay && person.hebrewMonth);

  const hebToday = hasHeb &&
    nextHebrewOccurrence(person.hebrewDay!, person.hebrewMonth!, today).getTime() === today.getTime();
  if (mode === 'hebrew') return hebToday;

  const gregToday = (() => {
    if (today < eventDate) return false;
    if (!person.isRecurring || person.recurrence === 'once') {
      return eventDate.getDate() === today.getDate() &&
             eventDate.getMonth() === today.getMonth() &&
             eventDate.getFullYear() === today.getFullYear();
    }
    if (person.recurrence === 'weekly') return eventDate.getDay() === today.getDay();
    if (person.recurrence === 'monthly') return eventDate.getDate() === today.getDate();
    return eventDate.getDate() === today.getDate() && eventDate.getMonth() === today.getMonth();
  })();

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
