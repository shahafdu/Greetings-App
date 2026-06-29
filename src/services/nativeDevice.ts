// Read the device's OWN contacts and calendar on Android/iOS (Capacitor plugins), mapped
// to the same shapes used by the Google services so the existing UI works unchanged.

import { Contacts } from '@capacitor-community/contacts';
import { CapacitorCalendar } from '@ebarooni/capacitor-calendar';
import type { GoogleContact, GoogleCalendarEvent } from './google';

const buildBirthday = (b?: { year?: number | null; month?: number | null; day?: number | null } | null): string | undefined => {
  if (!b || !b.month || !b.day) return undefined;
  const year = b.year || 2000;
  return `${year}-${String(b.month).padStart(2, '0')}-${String(b.day).padStart(2, '0')}`;
};

// Read device contacts (name, phone, birthday). Device contacts have no gender field.
export const fetchDeviceContacts = async (): Promise<GoogleContact[]> => {
  const perm = await Contacts.requestPermissions();
  if (perm.contacts !== 'granted' && perm.contacts !== 'limited') {
    throw new Error('לא ניתנה הרשאה לאנשי הקשר במכשיר.');
  }
  const { contacts } = await Contacts.getContacts({
    projection: { name: true, phones: true, birthday: true },
  });

  return contacts
    .map((c): GoogleContact | null => {
      const given = c.name?.given || undefined;
      const family = c.name?.family || undefined;
      const display = c.name?.display || undefined;
      const firstName = given || (display ? display.split(' ')[0] : undefined);
      if (!firstName) return null;
      const lastName = family || (display && !given ? display.split(' ').slice(1).join(' ') : undefined);
      const phone = (c.phones?.find(p => p.isPrimary) || c.phones?.[0])?.number || undefined;
      return {
        resourceName: c.contactId,
        firstName,
        lastName: lastName || undefined,
        phone: phone || undefined,
        gender: undefined,
        birthday: buildBirthday(c.birthday),
      };
    })
    .filter((c): c is GoogleContact => c !== null)
    .sort((a, b) => a.firstName.localeCompare(b.firstName, 'he'));
};

// Read device calendar events for the next ~13 months (matches the Google window).
export const fetchDeviceCalendarEvents = async (): Promise<GoogleCalendarEvent[]> => {
  // Read-only: requests only READ_CALENDAR (not WRITE_CALENDAR) — the app never modifies events.
  await CapacitorCalendar.requestReadOnlyCalendarAccess();

  const from = new Date();
  from.setDate(1);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setMonth(to.getMonth() + 13);

  const { result } = await CapacitorCalendar.listEventsInRange({ from: from.getTime(), to: to.getTime() });

  return result
    .filter(e => !!e.id && !!e.title)
    .map((e): GoogleCalendarEvent => {
      const d = new Date(e.startDate);
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { id: e.id, title: e.title, date };
    });
};
