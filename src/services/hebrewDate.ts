// Hebrew (Jewish) calendar helpers, built on @hebcal/core.
//
// Month numbers follow hebcal's convention: 1=Nisan … 6=Elul, 7=Tishrei … 11=Shvat,
// 12=Adar (Adar I in a leap year), 13=Adar II. We store day+month for an event so its
// anniversary can recur on the Hebrew calendar (a different Gregorian date each year).

import { HDate, gematriya } from '@hebcal/core';

// Hebrew-letter form of a day-of-month (1..30), e.g. 15 -> "ט״ו".
export const dayGematriya = (day: number): string => gematriya(day);

export interface HebrewDateParts {
  day: number;   // 1..30
  month: number; // 1..13 (hebcal numbering)
  year: number;  // Hebrew year, e.g. 5786
  formatted: string; // gematriya, e.g. "ט״ו בסיון תשפ״ו"
}

// Hebrew months in calendar-year order (Tishrei first), for pickers/labels.
export const HEBREW_MONTHS: { num: number; name: string }[] = [
  { num: 7, name: 'תשרי' }, { num: 8, name: 'חשוון' }, { num: 9, name: 'כסלו' },
  { num: 10, name: 'טבת' }, { num: 11, name: 'שבט' }, { num: 12, name: 'אדר' },
  { num: 13, name: 'אדר ב׳' }, { num: 1, name: 'ניסן' }, { num: 2, name: 'אייר' },
  { num: 3, name: 'סיון' }, { num: 4, name: 'תמוז' }, { num: 5, name: 'אב' }, { num: 6, name: 'אלול' },
];

export const hebrewMonthName = (month: number): string =>
  HEBREW_MONTHS.find(m => m.num === month)?.name || '';

// Map (day, month) to a valid date in a given Hebrew year: no Adar II in a non-leap year,
// and clamp the day to the month's length.
const clampToYear = (day: number, month: number, hy: number): { day: number; month: number } => {
  let m = month;
  if (!HDate.isLeapYear(hy) && m === 13) m = 12; // fold Adar II into Adar
  const maxDay = HDate.daysInMonth(m, hy);
  return { day: Math.min(Math.max(day, 1), maxDay), month: m };
};

const hebrewToGreg = (day: number, month: number, hy: number): Date => {
  const s = clampToYear(day, month, hy);
  const d = new HDate(s.day, s.month, hy).greg();
  d.setHours(0, 0, 0, 0);
  return d;
};

// Gregorian YYYY-MM-DD -> Hebrew parts.
export const gregToHebrew = (gregStr: string): HebrewDateParts | null => {
  const [y, m, d] = (gregStr || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  const hd = new HDate(new Date(y, m - 1, d));
  return { day: hd.getDate(), month: hd.getMonth(), year: hd.getFullYear(), formatted: hd.renderGematriya(true) };
};

// Format a Hebrew day+month (+ optional year) as Hebrew gematriya text.
export const formatHebrewDate = (day: number, month: number, year?: number): string => {
  const hy = year ?? new HDate().getFullYear();
  const s = clampToYear(day, month, hy);
  const full = new HDate(s.day, s.month, hy).renderGematriya(true); // "day month year"
  return year ? full : full.replace(/\s+\S+$/, ''); // strip year token when not requested
};

// Next Gregorian date on/after `from` on which the Hebrew day+month recurs.
export const nextHebrewOccurrence = (day: number, month: number, from: Date): Date => {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  start.setHours(0, 0, 0, 0);
  const baseHy = new HDate(start).getFullYear();
  for (let i = 0; i <= 2; i++) {
    const cand = hebrewToGreg(day, month, baseHy + i);
    if (cand.getTime() >= start.getTime()) return cand;
  }
  return hebrewToGreg(day, month, baseHy + 1);
};

// The Gregorian date on which a Hebrew day+month falls within a given Gregorian year
// (used to place Hebrew-anniversary events on the calendar grid).
export const hebrewAnniversaryInGregYear = (day: number, month: number, gregYear: number): Date | null => {
  for (const hy of [gregYear + 3760, gregYear + 3761]) {
    const g = hebrewToGreg(day, month, hy);
    if (g.getFullYear() === gregYear) return g;
  }
  return null;
};

// Short Hebrew label for a Gregorian day cell (e.g. "ט״ו"), plus the month at month boundaries.
export const hebrewDayLabel = (gregYear: number, gregMonth0: number, day: number): string => {
  const hd = new HDate(new Date(gregYear, gregMonth0, day));
  const dayGem = hd.renderGematriya(true).split(' ')[0]; // just the day token
  return dayGem;
};

// Hebrew month + year label spanning a Gregorian month (e.g. "סיון–תמוז תשפ״ו").
export const hebrewMonthYearLabel = (gregYear: number, gregMonth0: number): string => {
  const first = new HDate(new Date(gregYear, gregMonth0, 1));
  const last = new HDate(new Date(gregYear, gregMonth0 + 1, 0));
  const y = first.renderGematriya(true).split(' ').pop() || '';
  const m1 = hebrewMonthName(first.getMonth());
  const m2 = hebrewMonthName(last.getMonth());
  return m1 === m2 ? `${m1} ${y}` : `${m1}–${m2} ${y}`;
};
