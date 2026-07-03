// Lightweight i18n. Keys are the Hebrew source strings; when the language is English we look up
// a translation, otherwise (or if a translation is missing) we return the Hebrew as-is. This
// keeps the app fully working while screens are converted incrementally.

export type Lang = 'he' | 'en';

let current: Lang = 'he';
export const setLang = (l: Lang): void => { current = l; };
export const getLang = (): Lang => current;
export const isRTL = (): boolean => current === 'he';

// English translations keyed by the Hebrew source string.
const EN: Record<string, string> = {
  // App chrome / tabs
  'מזל טוב!': 'Congrats!',
  'מנהל אירועים וברכות חכמות': 'Smart events & greetings manager',
  'אירועים': 'Events',
  'לוח שנה': 'Calendar',
  'מחולל מהיר': 'Quick generator',
  'הגדרות': 'Settings',

  // Events page
  'אירוע חדש': 'New event',
  'חיפוש...': 'Search...',
  'נקה חיפוש': 'Clear search',
  'גלילה למעלה': 'Scroll to top',
  'גלילה לתחתית': 'Scroll to bottom',
  'לא נמצאו אירועים מתאימים לחיפוש.': 'No events match your search.',
  'מתוך': 'of',
  'ברכה': 'Greeting',
  'עריכה': 'Edit',
  'זכר': 'Male',
  'נקבה': 'Female',
  'זוג / רבים': 'Couple / group',
  'היום!': 'Today!',
  'מחר': 'Tomorrow',
  'בעוד': 'in',
  'ימים': 'days',
  'עבר': 'passed',

  // Common buttons / words
  'שמור שינויים': 'Save changes',
  'הוסף אירוע': 'Add event',
  'ביטול': 'Cancel',
  'סגור': 'Close',
  'הוסף': 'Add',
  'מחק': 'Delete',
  'הורד/י': 'Download',

  // Settings
  'הגדרות האפליקציה': 'App settings',
  'שפה': 'Language',
  'עברית': 'Hebrew',
  'אנגלית': 'English',
  'ההגדרות נשמרות אוטומטית ✓': 'Settings save automatically ✓',
  '🕎 הצג תאריכים עבריים': '🕎 Show Hebrew dates',
  'בדוק/י מפתח': 'Test key',
  'בודק...': 'Testing...',
};

export const t = (he: string): string => (current === 'en' ? (EN[he] ?? he) : he);
