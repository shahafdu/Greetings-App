import { describe, it, expect, vi } from 'vitest';
import { loadStorage, person, iso } from './helpers';

// "Today" for these tests: 10 March 2026, mid-morning local time.
const freeze = (y = 2026, m = 2, d = 10) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(y, m, d, 10, 0, 0));
};

describe('event dates', () => {
  it('runs west of UTC, where UTC-parsed dates are a day early (guards the tests below)', () => {
    expect(new Date('2024-03-10').getDate()).toBe(9);
  });

  it('parses stored dates as local days (not UTC)', async () => {
    const st = await loadStorage();
    expect(iso(st.parseLocalDate('2024-03-10'))).toBe('2024-03-10');
  });

  it("recognises today's birthday and counts 0 days", async () => {
    freeze();
    const st = await loadStorage();
    const p = person({ eventDate: '1990-03-10' });
    expect(st.isEventToday(p)).toBe(true);
    expect(st.getDaysToEvent(p)).toBe(0);
    expect(st.getCelebrationYears(p)).toBe(36);
  });

  it('counts tomorrow as 1 day and yesterday as next year', async () => {
    freeze();
    const st = await loadStorage();
    expect(st.getDaysToEvent(person({ eventDate: '1990-03-11' }))).toBe(1);
    expect(st.isEventToday(person({ eventDate: '1990-03-11' }))).toBe(false);
    expect(st.getDaysToEvent(person({ eventDate: '1990-03-09' }))).toBe(364);
  });

  it('counts whole days across a daylight-saving change', async () => {
    freeze(2026, 2, 7); // US clocks change on 8 March 2026
    const st = await loadStorage();
    expect(st.getDaysToEvent(person({ eventDate: '1990-03-09' }))).toBe(2);
  });

  it('puts a monthly event on the 31st on the last day of shorter months', async () => {
    const st = await loadStorage();
    const p = person({ eventDate: '2020-01-31', recurrence: 'monthly' });
    expect(st.gregorianOccursOn(p, new Date(2026, 3, 30))).toBe(true);
    expect(st.gregorianOccursOn(p, new Date(2026, 4, 1))).toBe(false);
    expect(iso(st.nextGregorianOccurrence(p, new Date(2026, 3, 2))!)).toBe('2026-04-30');
  });

  it('celebrates a 29 February birthday on 28 February in non-leap years', async () => {
    const st = await loadStorage();
    const p = person({ eventDate: '2020-02-29' });
    expect(st.gregorianOccursOn(p, new Date(2027, 1, 28))).toBe(true);
    expect(st.gregorianOccursOn(p, new Date(2027, 2, 1))).toBe(false);
    expect(st.gregorianOccursOn(p, new Date(2028, 1, 29))).toBe(true);
    expect(st.gregorianOccursOn(p, new Date(2028, 1, 28))).toBe(false);
  });

  it('reports a past one-time event as -1 and a future one by its date', async () => {
    freeze();
    const st = await loadStorage();
    expect(st.getDaysToEvent(person({ eventDate: '2020-01-05', isRecurring: false, recurrence: 'once' }))).toBe(-1);
    expect(st.getDaysToEvent(person({ eventDate: '2026-03-20', isRecurring: false, recurrence: 'once' }))).toBe(10);
  });

  it('does not show an event before its start date', async () => {
    const st = await loadStorage();
    const p = person({ eventDate: '2026-06-15', recurrence: 'weekly' });
    expect(st.gregorianOccursOn(p, new Date(2026, 5, 8))).toBe(false);
    expect(st.gregorianOccursOn(p, new Date(2026, 5, 22))).toBe(true);
  });
});

describe('event list order', () => {
  it('lists the nearest upcoming event first and past one-time events last', async () => {
    freeze();
    const st = await loadStorage();
    const sorted = st.sortByUpcoming([
      person({ id: 'past', firstName: 'Past', eventDate: '2020-01-05', isRecurring: false, recurrence: 'once' }),
      person({ id: 'dec', firstName: 'Dec', eventDate: '1990-12-01' }),
      person({ id: 'broken', firstName: 'Broken', eventDate: 'not-a-date' }),
      person({ id: 'feb', firstName: 'Feb', eventDate: '1990-02-01' }), // already passed this year
      person({ id: 'today', firstName: 'Today', eventDate: '1990-03-10' }),
      person({ id: 'week', firstName: 'Week', eventDate: '1990-03-17' }),
      person({ id: 'tomorrow', firstName: 'Tomorrow', eventDate: '1990-03-11' }),
    ]);
    expect(sorted.map(p => p.id)).toEqual(['today', 'tomorrow', 'week', 'dec', 'feb', 'broken', 'past']);
  });

  it('breaks ties by name', async () => {
    freeze();
    const st = await loadStorage();
    const sorted = st.sortByUpcoming([
      person({ id: 'b', firstName: 'Beth', eventDate: '1990-04-01' }),
      person({ id: 'a', firstName: 'Adam', eventDate: '1985-04-01' }),
    ]);
    expect(sorted.map(p => p.id)).toEqual(['a', 'b']);
  });
});
