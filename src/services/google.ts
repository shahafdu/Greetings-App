// Real Google API access (Contacts via People API, events via Calendar API).
// All calls use the short-lived OAuth access token obtained from Google sign-in
// (implicit flow), so the token must be passed in by the caller. A 401 means the
// token expired and the user should sign in again; a 403 usually means the relevant
// API is not enabled in the Google Cloud project, or the scope was not granted.

export interface GoogleContact {
  resourceName: string;
  firstName: string;
  lastName?: string;
  phone?: string;
  gender?: 'Male' | 'Female';
  birthday?: string; // YYYY-MM-DD (year may be a placeholder if Google has no year)
}

export interface GoogleCalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
}

export class GoogleApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'GoogleApiError';
  }
}

const friendlyError = (status: number): string => {
  if (status === 401) return 'החיבור לגוגל פג תוקף. נא להתחבר מחדש בהגדרות.';
  if (status === 403) return 'אין הרשאה. ודא שה-API מופעל בפרויקט Google Cloud ושנתת את ההרשאות המתאימות.';
  return `שגיאת רשת מול Google (קוד ${status}).`;
};

const googleGet = async (url: string, accessToken: string): Promise<any> => {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    throw new GoogleApiError(res.status, friendlyError(res.status));
  }
  return res.json();
};

const mapGender = (value?: string): 'Male' | 'Female' | undefined => {
  if (value === 'male') return 'Male';
  if (value === 'female') return 'Female';
  return undefined;
};

// People API "birthdays" may omit the year; build a usable YYYY-MM-DD either way.
const buildBirthday = (date?: { year?: number; month?: number; day?: number }): string | undefined => {
  if (!date || !date.month || !date.day) return undefined;
  const year = date.year || 2000;
  const mm = String(date.month).padStart(2, '0');
  const dd = String(date.day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
};

export const fetchGoogleContacts = async (accessToken: string): Promise<GoogleContact[]> => {
  const url =
    'https://people.googleapis.com/v1/people/me/connections' +
    '?personFields=names,phoneNumbers,genders,birthdays' +
    '&pageSize=200&sortOrder=FIRST_NAME_ASCENDING';

  const data = await googleGet(url, accessToken);
  const connections: any[] = data.connections || [];

  return connections
    .map((c): GoogleContact | null => {
      const name = c.names?.[0];
      const firstName = name?.givenName || name?.displayName;
      if (!firstName) return null; // skip contacts with no usable name
      return {
        resourceName: c.resourceName,
        firstName,
        lastName: name?.familyName || undefined,
        phone: c.phoneNumbers?.[0]?.value || undefined,
        gender: mapGender(c.genders?.[0]?.value),
        birthday: buildBirthday(c.birthdays?.[0]?.date)
      };
    })
    .filter((c): c is GoogleContact => c !== null);
};

export const fetchGoogleCalendarEvents = async (accessToken: string): Promise<GoogleCalendarEvent[]> => {
  // Window: from the start of the current month to ~13 months ahead, so the calendar grid
  // can show events across the year the user navigates. 250 is the API max page size.
  const timeMin = new Date();
  timeMin.setDate(1);
  timeMin.setHours(0, 0, 0, 0);
  const timeMax = new Date(timeMin);
  timeMax.setMonth(timeMax.getMonth() + 13);

  const url =
    'https://www.googleapis.com/calendar/v3/calendars/primary/events' +
    `?timeMin=${encodeURIComponent(timeMin.toISOString())}` +
    `&timeMax=${encodeURIComponent(timeMax.toISOString())}` +
    '&maxResults=250&singleEvents=true&orderBy=startTime';

  const data = await googleGet(url, accessToken);
  const items: any[] = data.items || [];

  return items
    .map((e): GoogleCalendarEvent | null => {
      const title = e.summary;
      const rawDate: string | undefined = e.start?.date || e.start?.dateTime;
      if (!title || !rawDate) return null;
      return { id: e.id, title, date: rawDate.slice(0, 10) };
    })
    .filter((e): e is GoogleCalendarEvent => e !== null);
};
