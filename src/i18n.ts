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
  'אירועים מהיומן — בחר/י מה להוסיף:': 'Calendar events — pick which to add:',
  'לא נוסף עדיין': 'Not added yet',
  'אירוע חדש ביום זה': 'New event on this day',
  'עריכת אירוע': 'Edit event',
  'הוספת אירוע': 'Add event',
  'ייבוא מאנשי קשר 📱': 'Import from contacts 📱',
  'שם פרטי': 'First name',
  'ישראל': 'e.g. John',
  'שם משפחה': 'Last name',
  'ישראלי': 'e.g. Doe',
  'סוג האירוע': 'Event type',
  'אחר (טקסט חופשי)': 'Other (free text)',
  'הקלד/י סוג אירוע מותאם אישית (למשל: בר מצווה, פרישה...)': 'Enter a custom event type (e.g. Bar Mitzvah, retirement...)',
  'תאריך האירוע': 'Event date',
  'תאריך עברי': 'Hebrew date',
  'ערוך': 'Edit',
  'אפס לאוטומטי': 'Reset to auto',
  'מתי לברך / להזכיר': 'When to greet / remind',
  'בתאריך הלועזי בלבד': 'Gregorian date only',
  'בתאריך העברי בלבד': 'Hebrew date only',
  'בשני התאריכים': 'Both dates',
  'מחזוריות האירוע': 'Recurrence',
  'אירוע חד-פעמי (ללא חזרה)': 'One-time (no repeat)',
  'שנתי (חוזר כל שנה)': 'Yearly (every year)',
  'חודשי (חוזר כל חודש)': 'Monthly (every month)',
  'שבועי (חוזר כל שבוע)': 'Weekly (every week)',
  'מערכת יחסים': 'Relationship',
  'הקלד/י קשר מותאם אישית (למשל: מנהל/ת, מורה, בן/בת דוד שני...)': 'Enter a custom relationship (e.g. manager, teacher, second cousin...)',
  'השתמש בשם פרטי בלבד בברכה': 'Use first name only in the greeting',
  'מגדר (עבור דקדוק הברכה)': 'Gender (for greeting grammar)',
  'שליחת הברכה דרך מישהו אחר (פרוקסי)': 'Send the greeting via someone else (proxy)',
  'שם מקבל/ת הברכה (למי לשלוח)': 'Recipient name (who to send to)',
  'למשל: דני / משפחת כהן': 'e.g. Danny / the Cohen family',
  'מגדר מקבל/ת הברכה': 'Recipient gender',
  'הקשר של בעל/ת האירוע למקבל/ת הברכה (אופציונלי)': 'Celebrant relation to the recipient (optional)',
  'למשל: הבן שלך, הנכדה שלכם': 'e.g. your son, your granddaughter',
  'הגדרות התראה (אנדרואיד / דפדפן)': 'Reminder settings (Android / browser)',
  'מועד ההתראה': 'Reminder timing',
  'ביום האירוע': 'On the event day',
  'יום לפני': 'A day before',
  'יומיים לפני': 'Two days before',
  'שבוע לפני': 'A week before',
  'שעת ההתראה': 'Reminder time',
  'טלפון לשליחה בוואטסאפ (אופציונלי)': 'Phone for WhatsApp (optional)',
  'הערות נוספות (תחביבים, איחולים מיוחדים)': 'Extra notes (hobbies, special wishes)',
  'אוהב שוקולד, קודם לאחרונה, מאחל לו הצלחה...': 'Loves chocolate, recently promoted, wish him success...',
  'שפת הברכה': 'Greeting language',
  'סגנון / טון הברכה': 'Greeting style / tone',
};

export const t = (he: string): string => (current === 'en' ? (EN[he] ?? he) : he);
