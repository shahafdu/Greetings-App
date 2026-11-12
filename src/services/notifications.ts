// Real OS notifications for upcoming events (Android via Capacitor LocalNotifications).
// We reschedule the full set whenever the events change and on app start: each event's
// NEXT occurrence is computed, offset by its notifyDaysBefore at notifyHour, and a one-shot
// notification is scheduled. Recurrence is handled by rescheduling on every launch.

import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { Person } from './storage';
import { getOccasionEmoji, getDateMode, getOccurrenceDateKind, getSettings, nextGregorianOccurrence } from './storage';
import { nextHebrewOccurrence } from './hebrewDate';

// Hebrew note for whether a notification's occurrence is the Hebrew or Gregorian date. Shown only
// when the user enabled "show Hebrew dates" (the app is configured to support both calendars).
const dateKindNote = (person: Person, occurrence: Date): string => {
  if (!getSettings().showHebrewDates) return '';
  const kind = getOccurrenceDateKind(person, occurrence);
  if (kind === 'hebrew') return ' (לפי התאריך העברי 🕎)';
  if (kind === 'gregorian') return ' (לפי התאריך הלועזי 📅)';
  if (kind === 'both') return ' (התאריך העברי והלועזי 🕎📅)';
  return '';
};

// The next date this event occurs on, respecting its dateMode (gregorian/hebrew/both = sooner).
const nextOccurrenceDate = (person: Person): Date | null => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const mode = getDateMode(person);
  const hasHeb = !!(person.hebrewDay && person.hebrewMonth);
  const heb = hasHeb ? nextHebrewOccurrence(person.hebrewDay!, person.hebrewMonth!, today) : null;
  if (mode === 'hebrew') return heb;
  const greg = nextGregorianOccurrence(person, today);
  if (mode === 'both') {
    const cands = [greg, heb].filter((d): d is Date => !!d);
    return cands.length ? cands.reduce((a, b) => (a.getTime() <= b.getTime() ? a : b)) : null;
  }
  return greg;
};

// Ensure notification permission, returning whether it's granted.
export const ensureNotificationPermission = async (): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) return false;
  let perm = await LocalNotifications.checkPermissions();
  if (perm.display === 'prompt' || perm.display === 'prompt-with-rationale') {
    perm = await LocalNotifications.requestPermissions();
  }
  return perm.display === 'granted';
};

// Cancel all currently scheduled notifications and reschedule from the given events.
export const scheduleEventNotifications = async (people: Person[]): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return;
  if (!(await ensureNotificationPermission())) return;

  // Clear what we previously scheduled so we don't duplicate.
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) {
    await LocalNotifications.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });
  }

  const now = Date.now();
  const notifications = people
    .map((p, idx) => {
      const occurrence = nextOccurrenceDate(p);
      if (!occurrence) return null;

      // Note: 0 is a valid hour/minute (midnight), so only fall back when the value is malformed.
      const [hh, mm] = (p.notifyHour || '09:00').split(':').map(Number);
      const hour = Number.isInteger(hh) && hh >= 0 && hh <= 23 ? hh : 9;
      const minute = Number.isInteger(mm) && mm >= 0 && mm <= 59 ? mm : 0;
      const daysBefore = Number.isFinite(p.notifyDaysBefore) && p.notifyDaysBefore > 0 ? Math.floor(p.notifyDaysBefore) : 0;
      const at = new Date(occurrence);
      at.setDate(at.getDate() - daysBefore);
      at.setHours(hour, minute, 0, 0);
      if (at.getTime() <= now) return null; // already passed

      const fullName = `${p.firstName}${p.lastName ? ' ' + p.lastName : ''}`;
      const days = daysBefore;
      const when = days === 0 ? 'היום' : days === 1 ? 'מחר' : `בעוד ${days} ימים`;
      const dateNote = dateKindNote(p, occurrence);

      return {
        id: idx + 1,
        title: `${getOccasionEmoji(p.occasion)} ${p.occasion} של ${p.firstName}`,
        body: `${when}: ${p.occasion} של ${fullName}${dateNote}. הקש/י כדי להכין ברכה.`,
        schedule: { at },
      };
    })
    .filter((n): n is NonNullable<typeof n> => n !== null);

  if (notifications.length) {
    await LocalNotifications.schedule({ notifications });
  }
};
