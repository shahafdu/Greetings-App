import type { Person } from '../src/services/storage';

export const K = {
  people: 'birthday_greetings_people',
  mirror: 'birthday_greetings_people_mirror',
  settings: 'birthday_greetings_settings',
  quickDrafts: 'birthday_greetings_quick_drafts',
  vaultMeta: 'birthday_greetings_vault_meta',
  vaultData: 'birthday_greetings_vault_data',
  googleToken: 'birthday_greetings_google_token',
};

// A fresh copy of the storage module = the app after a restart (empty in-memory caches).
export const loadStorage = () => import('../src/services/storage');

export const event = (over: Partial<Person> = {}): Omit<Person, 'id'> => ({
  firstName: 'דנה',
  eventDate: '1990-05-04',
  occasion: 'יום הולדת',
  relation: 'חבר/ה',
  gender: 'Female',
  notifyDaysBefore: 0,
  notifyHour: '09:00',
  isRecurring: true,
  recurrence: 'yearly',
  ...over,
});

export const person = (over: Partial<Person> = {}): Person => ({ id: 'p1', ...event(over) } as Person);

export const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Let queued encrypted writes land.
export const settle = () => new Promise(r => setTimeout(r, 300));
