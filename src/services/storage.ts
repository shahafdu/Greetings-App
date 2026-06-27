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
}

export type AiProvider = 'gemini' | 'groq';

export interface AppSettings {
  // Which AI backend to use for greetings. Each is optional; without a key the app
  // falls back to the built-in Hebrew templates.
  aiProvider?: AiProvider;
  geminiApiKey: string;
  geminiModel?: string;
  groqApiKey?: string;
  groqModel?: string;
  // The gender of the *sender* (the app user writing the greeting). Hebrew first-person
  // verbs ("מאחל" vs "מאחלת") depend on it, so it must be set for correct grammar.
  senderGender?: 'Male' | 'Female';
  useGoogleAuth: boolean;
  googleUserEmail?: string;
  googleUserName?: string;
  defaultNotifyHour: string;
  defaultNotifyDaysBefore: number;
}

export const DEFAULT_AI_PROVIDER: AiProvider = 'gemini';

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-lite';

// Models offered in Settings. Free-tier availability varies by account/region — if one
// returns a 429 "quota: 0", the user can switch to another here.
export const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  // Open Gemma models, also served free via the Gemini API (may have separate quota).
  'gemma-3-27b-it',
  'gemma-3-12b-it'
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

const PEOPLE_STORAGE_KEY = 'birthday_greetings_people';
const SETTINGS_STORAGE_KEY = 'birthday_greetings_settings';

export const RELATIONS = [
  'בן/בת זוג',
  'בן/בת',
  'ילד/ה',
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

const defaultPeople: Person[] = [
  {
    id: 'mock-1',
    firstName: 'אורן',
    lastName: 'כהן',
    eventDate: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`,
    occasion: 'יום הולדת',
    relation: 'חבר/ה קרוב/ה',
    gender: 'Male',
    phone: '0501234567',
    notes: 'אוהב כדורגל, יין אדום וטיולים בטבע',
    notifyDaysBefore: 0,
    notifyHour: '09:00',
    isRecurring: true,
    recurrence: 'yearly',
    useFirstNameOnly: true
  },
  {
    id: 'mock-2',
    firstName: 'מיכל ורוני',
    lastName: 'לוי',
    eventDate: '2018-06-16',
    occasion: 'יום נישואין',
    relation: 'בן/בת זוג',
    gender: 'Female',
    phone: '0547654321',
    notes: 'חוגגים שנות נישואין, אוהבים ספא ומסעדות יוקרה',
    notifyDaysBefore: 1,
    notifyHour: '10:00',
    isRecurring: true,
    recurrence: 'yearly',
    useFirstNameOnly: true
  },
  {
    id: 'mock-3',
    firstName: 'איתי',
    lastName: 'ברק',
    eventDate: '2026-06-25',
    occasion: 'סיום לימודים',
    relation: 'אח/אחות',
    gender: 'Male',
    phone: '0529998877',
    notes: 'מסיים תואר ראשון במדעי המחשב בהצטיינות, אוהב גיימינג',
    notifyDaysBefore: 2,
    notifyHour: '08:30',
    isRecurring: false,
    recurrence: 'once',
    useFirstNameOnly: true
  }
];

export const getPeople = (): Person[] => {
  const data = localStorage.getItem(PEOPLE_STORAGE_KEY);
  if (!data) {
    localStorage.setItem(PEOPLE_STORAGE_KEY, JSON.stringify(defaultPeople));
    return defaultPeople;
  }
  
  const parsed = JSON.parse(data) as any[];
  const migrated = parsed.map(p => {
    // Determine names split
    let firstName = p.firstName || '';
    let lastName = p.lastName || '';
    if (!firstName && p.name) {
      const parts = p.name.trim().split(/\s+/);
      firstName = parts[0];
      lastName = parts.slice(1).join(' ');
    }

    const relation = p.relation || 'חבר/ה';
    const useFirstNameOnly = p.useFirstNameOnly !== undefined 
      ? p.useFirstNameOnly 
      : isCloseRelation(relation);

    return {
      id: p.id || `person-${Date.now()}-${Math.random()}`,
      firstName: firstName || 'ללא שם',
      lastName: lastName || undefined,
      eventDate: p.eventDate || p.birthday || '1995-01-01',
      occasion: p.occasion || 'יום הולדת',
      relation: relation,
      gender: p.gender || 'Male',
      phone: p.phone,
      notes: p.notes,
      notifyDaysBefore: p.notifyDaysBefore !== undefined ? p.notifyDaysBefore : 0,
      notifyHour: p.notifyHour || '09:00',
      isRecurring: p.isRecurring !== undefined ? p.isRecurring : (p.recurrence ? p.recurrence !== 'once' : true),
      recurrence: p.recurrence || 'yearly',
      useFirstNameOnly: useFirstNameOnly
    };
  });
  
  return migrated;
};

export const savePeople = (people: Person[]): void => {
  localStorage.setItem(PEOPLE_STORAGE_KEY, JSON.stringify(people));
};

export const addPerson = (newPerson: Omit<Person, 'id'>): Person => {
  const people = getPeople();
  const person: Person = {
    ...newPerson,
    id: `person-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  };
  people.push(person);
  savePeople(people);
  return person;
};

export const updatePerson = (updatedPerson: Person): void => {
  const people = getPeople();
  const index = people.findIndex(p => p.id === updatedPerson.id);
  if (index !== -1) {
    people[index] = updatedPerson;
    savePeople(people);
  }
};

export const deletePerson = (id: string): void => {
  const people = getPeople();
  const filtered = people.filter(p => p.id !== id);
  savePeople(filtered);
};

export const getSettings = (): AppSettings => {
  const data = localStorage.getItem(SETTINGS_STORAGE_KEY);
  const settings: AppSettings = data ? JSON.parse(data) : {
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
  if (!settings.senderGender) settings.senderGender = 'Male';
  return settings;
};

export const saveSettings = (settings: AppSettings): void => {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
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

// Get number of days remaining until next event occurrence
export const getDaysToEvent = (person: Person): number => {
  const eventDate = new Date(person.eventDate);
  eventDate.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

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

// Check if an event is happening today
export const isEventToday = (person: Person): boolean => {
  const eventDate = new Date(person.eventDate);
  eventDate.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (today < eventDate) {
    return false;
  }

  if (!person.isRecurring || person.recurrence === 'once') {
    return eventDate.getDate() === today.getDate() && 
           eventDate.getMonth() === today.getMonth() && 
           eventDate.getFullYear() === today.getFullYear();
  }

  if (person.recurrence === 'weekly') {
    return eventDate.getDay() === today.getDay();
  }

  if (person.recurrence === 'monthly') {
    return eventDate.getDate() === today.getDate();
  }

  // Yearly
  return eventDate.getDate() === today.getDate() && eventDate.getMonth() === today.getMonth();
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
