export interface Person {
  id: string;
  firstName: string;
  lastName?: string;
  eventDate: string; // YYYY-MM-DD
  occasion: 'יום הולדת' | 'יום נישואין' | 'סיום לימודים' | 'קידום בעבודה' | 'הולדת תינוק/ת' | 'מעבר דירה' | 'חג שמח' | 'גיוס / שחרור' | 'אחר';
  relation: string;
  gender: 'Male' | 'Female';
  phone?: string;
  notes?: string;
  notifyDaysBefore: number;
  notifyHour: string; // "HH:MM"
  isRecurring: boolean;
  recurrence: 'yearly' | 'monthly' | 'weekly' | 'once';
  useFirstNameOnly?: boolean;
}

export interface AppSettings {
  geminiApiKey: string;
  useGoogleAuth: boolean;
  googleUserEmail?: string;
  googleUserName?: string;
  defaultNotifyHour: string;
  defaultNotifyDaysBefore: number;
}

const PEOPLE_STORAGE_KEY = 'birthday_greetings_people';
const SETTINGS_STORAGE_KEY = 'birthday_greetings_settings';

export const RELATIONS = [
  'בן/בת זוג',
  'ילד/ה',
  'הורה',
  'אח/אחות',
  'חבר/ה קרוב/ה',
  'חבר/ה',
  'קולגה',
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

// Helper to determine if a relationship is close
export const isCloseRelation = (relation: string): boolean => {
  return ['בן/בת זוג', 'ילד/ה', 'הורה', 'אח/אחות', 'חבר/ה קרוב/ה'].includes(relation);
};

const defaultPeople: Person[] = [
  {
    id: 'mock-1',
    firstName: 'אורן',
    lastName: 'כהן',
    eventDate: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`,
    occasion: 'יום הולדת',
    relation: 'חבר קרוב',
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
    relation: 'משפחה',
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
    relation: 'אח',
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
  return data ? JSON.parse(data) : {
    geminiApiKey: '',
    useGoogleAuth: false,
    defaultNotifyHour: '09:00',
    defaultNotifyDaysBefore: 0
  };
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
