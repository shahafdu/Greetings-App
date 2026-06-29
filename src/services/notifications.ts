// Real OS notifications for upcoming events (Android via Capacitor LocalNotifications).
// We reschedule the full set whenever the events change and on app start: each event's
// NEXT occurrence is computed, offset by its notifyDaysBefore at notifyHour, and a one-shot
// notification is scheduled. Recurrence is handled by rescheduling on every launch.

import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { Person } from './storage';
import { getOccasionEmoji } from './storage';

// The next calendar date this event occurs on (or null for a past one-time event).
const nextOccurrenceDate = (person: Person): Date | null => {
  const ev = new Date(person.eventDate);
  ev.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!person.isRecurring || person.recurrence === 'once') {
    return ev >= today ? ev : null;
  }
  if (person.recurrence === 'weekly') {
    let diff = ev.getDay() - today.getDay();
    if (diff < 0) diff += 7;
    const d = new Date(today);
    d.setDate(today.getDate() + diff);
    return d;
  }
  if (person.recurrence === 'monthly') {
    let month = today.getMonth();
    let year = today.getFullYear();
    if (today.getDate() > ev.getDate()) {
      month++;
      if (month > 11) { month = 0; year++; }
    }
    return new Date(year, month, ev.getDate());
  }
  // yearly
  const next = new Date(today.getFullYear(), ev.getMonth(), ev.getDate());
  if (next < today) next.setFullYear(today.getFullYear() + 1);
  return next;
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

      const [hh, mm] = (p.notifyHour || '09:00').split(':').map(Number);
      const at = new Date(occurrence);
      at.setDate(at.getDate() - (p.notifyDaysBefore || 0));
      at.setHours(hh || 9, mm || 0, 0, 0);
      if (at.getTime() <= now) return null; // already passed

      const fullName = `${p.firstName}${p.lastName ? ' ' + p.lastName : ''}`;
      const days = p.notifyDaysBefore || 0;
      const when = days === 0 ? 'היום' : days === 1 ? 'מחר' : `בעוד ${days} ימים`;

      return {
        id: idx + 1,
        title: `${getOccasionEmoji(p.occasion)} ${p.occasion} של ${p.firstName}`,
        body: `${when}: ${p.occasion} של ${fullName}. הקש/י כדי להכין ברכה.`,
        schedule: { at },
      };
    })
    .filter((n): n is NonNullable<typeof n> => n !== null);

  if (notifications.length) {
    await LocalNotifications.schedule({ notifications });
  }
};
