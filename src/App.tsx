import { useState, useEffect, useRef } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { Capacitor } from '@capacitor/core';
import { GoogleSignIn } from '@capawesome/capacitor-google-sign-in';
import {
  Calendar as CalendarIcon,
  Users,
  Settings as SettingsIcon,
  Plus,
  Trash2,
  Edit,
  Search,
  Copy,
  Sparkles,
  X,
  ChevronRight,
  ChevronLeft,
  Eye,
  EyeOff,
  Phone,
  FileText,
  LogOut,
  Bell,
  LogIn,
  Import,
  CheckCircle,
  ArrowUp,
  ArrowDown
} from 'lucide-react';

import type { Person, AppSettings } from './services/storage';
import {
  getPeople,
  addPerson,
  updatePerson,
  deletePerson,
  getSettings,
  saveSettings,
  initStorage,
  unlockStorage,
  enableLock,
  disableLock,
  isLockEnabled,
  calculateYears,
  getDaysToEvent,
  isEventToday,
  getOccasionEmoji,
  getGenderLabel,
  getRelationCategory,
  isCloseRelation,
  OCCASIONS,
  RELATIONS,
  GEMINI_MODELS,
  DEFAULT_GEMINI_MODEL,
  GROQ_MODELS,
  DEFAULT_GROQ_MODEL,
  OPENROUTER_MODELS,
  DEFAULT_OPENROUTER_MODEL
} from './services/storage';
import type { AiProvider } from './services/storage';

import { generateHebrewBirthdayGreeting, testAiApiKey, fetchOpenRouterFreeModels } from './services/gemini';
import {
  fetchGoogleContacts,
  fetchGoogleCalendarEvents,
  GoogleApiError
} from './services/google';
import type { GoogleContact, GoogleCalendarEvent } from './services/google';

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
];

const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

// Best-effort guess of an occasion type from a free-text calendar event title.
const guessOccasion = (title: string): Person['occasion'] => {
  const t = title.toLowerCase();
  if (t.includes('יום הולדת') || t.includes('birthday') || t.includes('🎂')) return 'יום הולדת';
  if (t.includes('נישואין') || t.includes('anniversary')) return 'יום נישואין';
  if (t.includes('סיום') || t.includes('graduation')) return 'סיום לימודים';
  if (t.includes('תינוק') || t.includes('baby') || t.includes('לידה')) return 'הולדת תינוק/ת';
  if (t.includes('דירה') || t.includes('בית חדש')) return 'מעבר דירה';
  if (t.includes('חג') || t.includes('holiday')) return 'חג שמח';
  if (t.includes('גיוס') || t.includes('שחרור')) return 'גיוס / שחרור';
  return 'אחר';
};

// Google OAuth: the WEB client ID is used in code on every platform (the native Android
// client, matched by package name + SHA-1, is verified by Google behind the scenes).
const GOOGLE_WEB_CLIENT_ID = '463592318658-5qh4cgp4cplpkie97ufb49do45pa4olp.apps.googleusercontent.com';
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/calendar.readonly'
];

export default function App() {
  // App navigation
  const [activeTab, setActiveTab] = useState<'list' | 'calendar' | 'quick-generate' | 'settings'>('list');
  const [people, setPeople] = useState<Person[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Settings & Google Auth
  const [settings, setLocalSettings] = useState<AppSettings>({
    aiProvider: 'gemini',
    geminiApiKey: '',
    geminiModel: DEFAULT_GEMINI_MODEL,
    groqApiKey: '',
    groqModel: DEFAULT_GROQ_MODEL,
    openRouterApiKey: '',
    openRouterModel: DEFAULT_OPENROUTER_MODEL,
    senderGender: 'Male',
    useGoogleAuth: false,
    defaultNotifyHour: '09:00',
    defaultNotifyDaysBefore: 0
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success'>('idle');

  // Form State
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [formFirstName, setFormFirstName] = useState('');
  const [formLastName, setFormLastName] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formOccasion, setFormOccasion] = useState<Person['occasion']>('יום הולדת');
  const [formRelation, setFormRelation] = useState('חבר/ה');
  const [formGender, setFormGender] = useState<Person['gender']>('Male');
  const [formPhone, setFormPhone] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formNotifyDays, setFormNotifyDays] = useState(0);
  const [formNotifyHour, setFormNotifyHour] = useState('09:00');
  const [formIsRecurring, setFormIsRecurring] = useState(true);
  const [formRecurrence, setFormRecurrence] = useState<'yearly' | 'monthly' | 'weekly' | 'once'>('yearly');
  const [formUseFirstNameOnly, setFormUseFirstNameOnly] = useState(true);
  // Proxy delivery (send the greeting to someone other than the celebrant)
  const [formViaProxy, setFormViaProxy] = useState(false);
  const [formProxyName, setFormProxyName] = useState('');
  const [formProxyGender, setFormProxyGender] = useState<Person['gender']>('Male');
  const [formCelebrantLink, setFormCelebrantLink] = useState('');

  // Calendar Navigation State
  const todayDate = new Date();
  const [calendarMonth, setCalendarMonth] = useState(todayDate.getMonth());
  const [calendarYear, setCalendarYear] = useState(todayDate.getFullYear());

  // Greeting Modal State
  const [showGreetingModal, setShowGreetingModal] = useState(false);
  const [greetingPerson, setGreetingPerson] = useState<Person | null>(null);
  const [greetingText, setGreetingText] = useState('');
  const [greetingTone, setGreetingTone] = useState<'normal' | 'funny' | 'emotional' | 'short'>('normal');
  const [customGreetingDetails, setCustomGreetingDetails] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [greetingError, setGreetingError] = useState('');
  const [copyFeedback, setCopyFeedback] = useState(false);

  // On-Demand Quick Generator Mode State (Feature 2)
  const [isQuickMode, setIsQuickMode] = useState(false);
  const [quickFirstName, setQuickFirstName] = useState('');
  const [quickLastName, setQuickLastName] = useState('');
  const [quickOccasion, setQuickOccasion] = useState<Person['occasion']>('יום הולדת');
  const [quickRelation, setQuickRelation] = useState('חבר/ה');
  const [quickGender, setQuickGender] = useState<Person['gender']>('Male');
  const [quickYears, setQuickYears] = useState(25);
  const [quickUseFirstNameOnly, setQuickUseFirstNameOnly] = useState(true);
  const [quickViaProxy, setQuickViaProxy] = useState(false);
  const [quickProxyName, setQuickProxyName] = useState('');
  const [quickProxyGender, setQuickProxyGender] = useState<Person['gender']>('Male');
  const [quickCelebrantLink, setQuickCelebrantLink] = useState('');

  // Google OAuth access token (short-lived; kept in memory + sessionStorage for the session)
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);

  // Contacts picker modal state (real Google Contacts via People API)
  const [showContactsModal, setShowContactsModal] = useState(false);
  const [googleContacts, setGoogleContacts] = useState<GoogleContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState('');
  const [contactsSearch, setContactsSearch] = useState('');
  // Where a picked contact's details are filled in: the add-event form or the quick generator.
  const [contactsTarget, setContactsTarget] = useState<'form' | 'quick'>('form');

  // Measured height of the sticky top bar, exposed as a CSS var for sticky offsets.
  const headerRef = useRef<HTMLElement>(null);
  // Action to auto-run once an inline Google login completes (so the user doesn't have
  // to go to Settings to connect, then come back).
  const pendingGoogleActionRef = useRef<null | 'contacts' | 'calendar'>(null);

  // App Lock: initialize storage; if encrypted, gate the app behind an unlock screen.
  const [lockState, setLockState] = useState<'locked' | 'unlocked'>(() => initStorage() === 'locked' ? 'locked' : 'unlocked');
  const [unlockInput, setUnlockInput] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [lockEnabled, setLockEnabled] = useState(() => isLockEnabled());
  const [newPassphrase, setNewPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [lockSetupError, setLockSetupError] = useState('');

  // Calendar Sync state (real Google Calendar via Calendar API; shown on the calendar grid)
  const [googleEvents, setGoogleEvents] = useState<GoogleCalendarEvent[]>([]);
  const [importedEventIds, setImportedEventIds] = useState<string[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState('');

  // Gemini key-test state (Settings)
  const [keyTestStatus, setKeyTestStatus] = useState<'idle' | 'testing' | 'valid' | 'invalid'>('idle');
  const [keyTestError, setKeyTestError] = useState('');

  // Live list of OpenRouter free models (fetched when that provider is selected)
  const [orModels, setOrModels] = useState<string[]>([]);
  const [orModelsLoading, setOrModelsLoading] = useState(false);
  const [orModelsError, setOrModelsError] = useState('');

  // Helper to refresh people list
  const refreshPeopleList = () => {
    setPeople(getPeople());
  };

  // Load initial data
  useEffect(() => {
    refreshPeopleList();
    setLocalSettings(getSettings());

    // Restore a saved OAuth access token so the Google connection persists across
    // restarts (the token is short-lived ~1h; on expiry we prompt an inline re-login).
    const savedToken = localStorage.getItem('birthday_greetings_google_token');
    if (savedToken) setGoogleAccessToken(savedToken);
  }, []);

  // Track the sticky top bar's height so sticky offsets (sidebar form, list header) align.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const setVar = () => document.documentElement.style.setProperty('--app-header-h', `${el.offsetHeight}px`);
    setVar();
    const ro = new ResizeObserver(setVar);
    ro.observe(el);
    window.addEventListener('resize', setVar);
    return () => { ro.disconnect(); window.removeEventListener('resize', setVar); };
  }, []);

  // After an inline Google login finishes (token becomes available), run whatever the
  // user was trying to do (open contacts / sync calendar).
  useEffect(() => {
    if (!googleAccessToken) return;
    const action = pendingGoogleActionRef.current;
    if (!action) return;
    pendingGoogleActionRef.current = null;
    if (action === 'contacts') {
      openContactsModal(contactsTarget);
    } else {
      setActiveTab('calendar');
      syncGoogleCalendar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleAccessToken]);

  const handleGoogleLoginFor = (action: 'contacts' | 'calendar') => {
    pendingGoogleActionRef.current = action;
    handleGoogleLogin();
  };

  // Fetch OpenRouter's live free-model list when that provider is selected, and auto-correct
  // the chosen model if it's no longer offered for free.
  useEffect(() => {
    if (settings.aiProvider !== 'openrouter' || orModels.length) return;
    setOrModelsLoading(true);
    setOrModelsError('');
    fetchOpenRouterFreeModels()
      .then(list => {
        setOrModels(list);
        if (list.length && !list.includes(settings.openRouterModel || '')) {
          const preferred =
            list.find(m => m.includes('gpt-oss-120b')) ||
            list.find(m => m.includes('gpt-oss')) ||
            list.find(m => m.includes('gemma-3')) ||
            list.find(m => m.includes('gemma')) ||
            list[0];
          setLocalSettings(s => ({ ...s, openRouterModel: preferred }));
        }
      })
      .catch(e => setOrModelsError(e?.message || String(e)))
      .finally(() => setOrModelsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.aiProvider]);

  // Auto-toggles first name checkbox based on relationship type
  const handleRelationChange = (val: string) => {
    setFormRelation(val);
    setFormUseFirstNameOnly(isCloseRelation(val));
  };

  const handleQuickRelationChange = (val: string) => {
    setQuickRelation(val);
    setQuickUseFirstNameOnly(isCloseRelation(val));
  };

  // Google Login Auth Trigger
  const login = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      // Note: never log tokenResponse — it contains the access token.
      // Fetch user profile from Google
      try {
        const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
        });
        const userInfo = await userInfoResponse.json();

        // Persist the access token for this session so we can call Calendar/People APIs.
        setGoogleAccessToken(tokenResponse.access_token);
        localStorage.setItem('birthday_greetings_google_token', tokenResponse.access_token);

        const updatedSettings = {
          ...settings,
          useGoogleAuth: true,
          googleUserName: userInfo.name,
          googleUserEmail: userInfo.email
        };
        setLocalSettings(updatedSettings);
        saveSettings(updatedSettings);
        localStorage.setItem('birthday_greetings_google_auth_active', 'true');
        setIsLoggingIn(false);
      } catch (err) {
        console.error('Failed to fetch user info:', err);
        setIsLoggingIn(false);
      }
    },
    onError: () => {
      console.log('Login Failed');
      setIsLoggingIn(false);
    },
    scope: 'https://www.googleapis.com/auth/contacts.readonly https://www.googleapis.com/auth/calendar.readonly'
  });

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    // On Android/iOS the web OAuth popup can't complete inside the webview, so use the
    // native Google Sign-In plugin. On the web we keep the existing popup flow.
    if (Capacitor.isNativePlatform()) {
      try {
        await GoogleSignIn.initialize({ clientId: GOOGLE_WEB_CLIENT_ID, scopes: GOOGLE_SCOPES });
        const result = await GoogleSignIn.signIn();
        if (result.accessToken) {
          setGoogleAccessToken(result.accessToken);
          localStorage.setItem('birthday_greetings_google_token', result.accessToken);
        }
        const updatedSettings = {
          ...settings,
          useGoogleAuth: true,
          googleUserName: result.displayName || result.givenName || undefined,
          googleUserEmail: result.email || undefined
        };
        setLocalSettings(updatedSettings);
        saveSettings(updatedSettings);
        localStorage.setItem('birthday_greetings_google_auth_active', 'true');
      } catch (err) {
        console.error('Native Google sign-in failed:', err);
      } finally {
        setIsLoggingIn(false);
      }
      return;
    }
    // Web: the OAuth token is short-lived, so reconnecting refreshes an expired session.
    login();
  };

  // Google Sign-Out
  const handleGoogleLogout = () => {
    if (Capacitor.isNativePlatform()) {
      GoogleSignIn.signOut().catch(() => { /* ignore */ });
    }
    const updatedSettings = {
      ...settings,
      useGoogleAuth: false,
      googleUserName: undefined,
      googleUserEmail: undefined
    };
    setLocalSettings(updatedSettings);
    saveSettings(updatedSettings);
    localStorage.removeItem('birthday_greetings_google_auth_active');
    setGoogleAccessToken(null);
    localStorage.removeItem('birthday_greetings_google_token');
  };

  // Shared handler: surface a Google API error, dropping an expired token so the UI
  // can prompt a reconnect.
  const handleGoogleApiError = (err: unknown, setError: (msg: string) => void) => {
    if (err instanceof GoogleApiError) {
      if (err.status === 401) {
        setGoogleAccessToken(null);
        localStorage.removeItem('birthday_greetings_google_token');
      }
      setError(err.message);
    } else {
      console.error(err);
      setError('שגיאה בלתי צפויה בעת טעינת הנתונים מגוגל.');
    }
  };

  // Fetch contacts once and cache them (used both by the picker and for auto-matching
  // a phone number to a calendar event). Returns the freshly fetched list.
  const ensureContactsLoaded = async (): Promise<GoogleContact[]> => {
    if (!googleAccessToken) return [];
    if (googleContacts.length > 0) return googleContacts;
    const list = await fetchGoogleContacts(googleAccessToken);
    setGoogleContacts(list);
    return list;
  };

  // Open the contacts picker and fetch real Google Contacts.
  // `target` decides whether a pick fills the add-event form or the quick generator.
  const openContactsModal = async (target: 'form' | 'quick' = 'form') => {
    setContactsTarget(target);
    setShowContactsModal(true);
    setContactsError('');
    setContactsSearch('');
    if (!googleAccessToken) {
      setContactsError('not-connected');
      return;
    }
    setContactsLoading(true);
    try {
      setGoogleContacts(await fetchGoogleContacts(googleAccessToken));
    } catch (err) {
      handleGoogleApiError(err, setContactsError);
    } finally {
      setContactsLoading(false);
    }
  };

  // Fetch Google Calendar events (and contacts, for phone auto-linking) into state so they
  // can be shown directly on the calendar grid. No modal — events appear as importable chips.
  const syncGoogleCalendar = async () => {
    setCalendarError('');
    if (!googleAccessToken) {
      setCalendarError('not-connected');
      return;
    }
    setCalendarLoading(true);
    try {
      const [events] = await Promise.all([
        fetchGoogleCalendarEvents(googleAccessToken),
        ensureContactsLoaded().catch(() => [])
      ]);
      setGoogleEvents(events);
    } catch (err) {
      handleGoogleApiError(err, setCalendarError);
    } finally {
      setCalendarLoading(false);
    }
  };

  // Trigger from the add-event form: jump to the calendar tab and sync.
  const handleOpenCalendarSync = () => {
    setActiveTab('calendar');
    syncGoogleCalendar();
  };

  // Find a contact whose name appears in a calendar event title, to attach their phone.
  const matchContactForEvent = (title: string): GoogleContact | undefined => {
    const t = title.toLowerCase();
    return googleContacts.find(c => {
      const first = c.firstName?.toLowerCase().trim();
      const full = `${c.firstName} ${c.lastName || ''}`.toLowerCase().trim();
      return (!!first && t.includes(first)) || (!!full && t.includes(full));
    });
  };

  // Validate the user's own Gemini API key from Settings.
  const handleTestGeminiKey = async () => {
    setKeyTestStatus('testing');
    setKeyTestError('');
    const result = await testAiApiKey(settings);
    if (result.ok) {
      setKeyTestStatus('valid');
    } else {
      setKeyTestStatus('invalid');
      setKeyTestError(result.error || '');
    }
  };

  // Settings Save
  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    saveSettings(settings);
    setSaveStatus('success');
    setTimeout(() => setSaveStatus('idle'), 3000);
  };

  // Unlock the encrypted app with the passphrase, then load the decrypted data.
  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnlocking(true);
    setUnlockError('');
    const ok = await unlockStorage(unlockInput);
    setUnlocking(false);
    if (ok) {
      setUnlockInput('');
      setLockState('unlocked');
      refreshPeopleList();
      setLocalSettings(getSettings());
    } else {
      setUnlockError('סיסמה שגויה. נסה/י שוב.');
    }
  };

  // Enable the App Lock: encrypt current data behind a new passphrase.
  const handleEnableLock = async () => {
    setLockSetupError('');
    if (newPassphrase.length < 4) {
      setLockSetupError('הסיסמה חייבת להכיל לפחות 4 תווים.');
      return;
    }
    if (newPassphrase !== confirmPassphrase) {
      setLockSetupError('הסיסמאות אינן תואמות.');
      return;
    }
    await enableLock(newPassphrase);
    setLockEnabled(true);
    setNewPassphrase('');
    setConfirmPassphrase('');
  };

  // Disable the App Lock: store data as plaintext again.
  const handleDisableLock = () => {
    if (!window.confirm('לבטל את נעילת האפליקציה? הנתונים יישמרו ללא הצפנה במכשיר.')) return;
    disableLock();
    setLockEnabled(false);
  };


  // Reset the add/edit form back to a blank "new event" state.
  const resetForm = () => {
    setEditingPerson(null);
    setFormFirstName('');
    setFormLastName('');
    setFormDate('');
    setFormOccasion('יום הולדת');
    setFormRelation('חבר/ה');
    setFormGender('Male');
    setFormPhone('');
    setFormNotes('');
    setFormNotifyDays(0);
    setFormNotifyHour('09:00');
    setFormIsRecurring(true);
    setFormRecurrence('yearly');
    setFormUseFirstNameOnly(true);
    setFormViaProxy(false);
    setFormProxyName('');
    setFormProxyGender('Male');
    setFormCelebrantLink('');
  };

  // Start a fresh event from the list (no need to save the current one first).
  const handleNewEvent = () => {
    resetForm();
    setActiveTab('list');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Form Submit (Add / Edit)
  const handleSubmitPerson = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formFirstName.trim() || !formDate) return;

    const personData = {
      firstName: formFirstName,
      lastName: formLastName ? formLastName : undefined,
      eventDate: formDate,
      occasion: formOccasion.trim() || 'אחר',
      relation: formRelation.trim() || 'אחר',
      gender: formGender,
      phone: formPhone || undefined,
      notes: formNotes || undefined,
      notifyDaysBefore: formNotifyDays,
      notifyHour: formNotifyHour,
      isRecurring: formIsRecurring,
      recurrence: formIsRecurring ? formRecurrence : 'once',
      useFirstNameOnly: formUseFirstNameOnly,
      proxyName: formViaProxy && formProxyName.trim() ? formProxyName.trim() : undefined,
      proxyGender: formViaProxy ? formProxyGender : undefined,
      celebrantRelationToProxy: formViaProxy && formCelebrantLink.trim() ? formCelebrantLink.trim() : undefined
    };

    if (editingPerson) {
      updatePerson({ ...personData, id: editingPerson.id });
    } else {
      addPerson(personData);
    }

    resetForm();
    refreshPeopleList();
  };

  // Delete Person
  const handleDeletePerson = (id: string, name: string) => {
    if (window.confirm(`האם אתה בטוח שברצונך למחוק את האירוע של ${name}?`)) {
      deletePerson(id);
      refreshPeopleList();
    }
  };

  // Form Start Edit
  const handleStartEdit = (person: Person) => {
    setEditingPerson(person);
    setFormFirstName(person.firstName);
    setFormLastName(person.lastName || '');
    setFormDate(person.eventDate);
    setFormOccasion(person.occasion);
    setFormRelation(person.relation);
    setFormGender(person.gender);
    setFormPhone(person.phone || '');
    setFormNotes(person.notes || '');
    setFormNotifyDays(person.notifyDaysBefore || 0);
    setFormNotifyHour(person.notifyHour || '09:00');
    setFormIsRecurring(person.isRecurring);
    setFormRecurrence(person.recurrence);
    setFormUseFirstNameOnly(person.useFirstNameOnly || false);
    setFormViaProxy(!!person.proxyName);
    setFormProxyName(person.proxyName || '');
    setFormProxyGender(person.proxyGender || 'Male');
    setFormCelebrantLink(person.celebrantRelationToProxy || '');
  };

  // Generate Greeting Action (Stored Person)
  const handleOpenGreeting = async (person: Person) => {
    setIsQuickMode(false);
    setGreetingPerson(person);
    setGreetingTone('normal');
    setCustomGreetingDetails('');
    setGreetingText('');
    setGreetingError('');
    setShowGreetingModal(true);
    setIsGenerating(true);

    try {
      const { text, error } = await generateHebrewBirthdayGreeting(person, 'normal', '', settings);
      setGreetingText(text);
      setGreetingError(error || '');
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  // Switch to the Quick Generator tab, clearing any leftover stored-person context
  // so tone/regenerate buttons operate on the quick-form fields and not a previous person.
  const handleOpenQuickGenerator = () => {
    setActiveTab('quick-generate');
    setIsQuickMode(false);
    setGreetingPerson(null);
    setGreetingText('');
    setGreetingError('');
  };

  // Trigger on-demand generation inside modal
  const handleGenerateOnDemand = async () => {
    if (!quickFirstName.trim()) {
      alert('נא להזין שם פרטי');
      return;
    }
    
    setIsGenerating(true);
    setGreetingText('');
    setGreetingError('');

    // Construct a mock Person object on-the-fly
    // Years calculation helper: subtract years from today
    const mockBirthYear = new Date().getFullYear() - quickYears;
    const mockDateStr = `${mockBirthYear}-01-01`;

    const mockPerson: Person = {
      id: 'quick-demand-mock',
      firstName: quickFirstName,
      lastName: quickLastName || undefined,
      eventDate: mockDateStr,
      occasion: quickOccasion,
      relation: quickRelation,
      gender: quickGender,
      notifyDaysBefore: 0,
      notifyHour: '09:00',
      isRecurring: false,
      recurrence: 'once',
      useFirstNameOnly: quickUseFirstNameOnly,
      proxyName: quickViaProxy && quickProxyName.trim() ? quickProxyName.trim() : undefined,
      proxyGender: quickViaProxy ? quickProxyGender : undefined,
      celebrantRelationToProxy: quickViaProxy && quickCelebrantLink.trim() ? quickCelebrantLink.trim() : undefined
    };

    try {
      const { text, error } = await generateHebrewBirthdayGreeting(
        mockPerson,
        greetingTone,
        customGreetingDetails,
        settings
      );
      setGreetingText(text);
      setGreetingError(error || '');
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  // Regenerate/Update Greeting (both modes)
  const handleRegenerateGreeting = async (
    tone = greetingTone,
    customText = customGreetingDetails,
    person = greetingPerson
  ) => {
    if (!person) {
      // If no person, we are in Quick Mode, construct a mock person
      const mockBirthYear = new Date().getFullYear() - quickYears;
      person = {
        id: 'quick-demand-mock',
        firstName: quickFirstName,
        lastName: quickLastName || undefined,
        eventDate: `${mockBirthYear}-01-01`,
        occasion: quickOccasion,
        relation: quickRelation,
        gender: quickGender,
        notifyDaysBefore: 0,
        notifyHour: '09:00',
        isRecurring: false,
        recurrence: 'once',
        useFirstNameOnly: quickUseFirstNameOnly,
        proxyName: quickViaProxy && quickProxyName.trim() ? quickProxyName.trim() : undefined,
        proxyGender: quickViaProxy ? quickProxyGender : undefined,
        celebrantRelationToProxy: quickViaProxy && quickCelebrantLink.trim() ? quickCelebrantLink.trim() : undefined
      };
    }

    setIsGenerating(true);
    try {
      const { text, error } = await generateHebrewBirthdayGreeting(person, tone, customText, settings);
      setGreetingText(text);
      setGreetingError(error || '');
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  // Copy Greeting
  const handleCopyGreeting = () => {
    navigator.clipboard.writeText(greetingText);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  // Send via WhatsApp
  const handleWhatsAppSend = () => {
    let phoneNum = '';
    if (!isQuickMode && greetingPerson?.phone) {
      phoneNum = greetingPerson.phone.replace(/\D/g, '');
    }
    
    if (phoneNum.startsWith('0')) {
      phoneNum = '972' + phoneNum.substring(1);
    }
    
    const encodedText = encodeURIComponent(greetingText);
    const whatsappUrl = phoneNum 
      ? `https://wa.me/${phoneNum}?text=${encodedText}`
      : `https://wa.me/?text=${encodedText}`;
      
    window.open(whatsappUrl, '_blank');
  };

  // Attach a real Google contact. In the quick generator it fills the quick fields;
  // in the add-event form it fills phone/gender/birthday (and name only when empty,
  // so it can "connect a phone" to a calendar-imported event without overwriting it).
  const handleSelectGoogleContact = (c: GoogleContact) => {
    if (contactsTarget === 'quick') {
      setQuickFirstName(c.firstName);
      setQuickLastName(c.lastName || '');
      if (c.gender) setQuickGender(c.gender);
      if (c.birthday) setQuickYears(calculateYears(c.birthday));
      setShowContactsModal(false);
      return;
    }
    if (!formFirstName.trim()) {
      setFormFirstName(c.firstName);
      setFormLastName(c.lastName || '');
    }
    if (c.phone) setFormPhone(c.phone);
    if (c.gender) setFormGender(c.gender);
    if (c.birthday && !formDate) {
      setFormDate(c.birthday);
      setFormOccasion('יום הולדת');
      setFormIsRecurring(true);
      setFormRecurrence('yearly');
    }
    setShowContactsModal(false);
  };

  // Import a real Google Calendar event, auto-linking a matching contact's phone/gender
  // so the event is ready to send on WhatsApp (calendar has the date, contacts have the number).
  const handleImportGoogleEvent = (event: GoogleCalendarEvent) => {
    const occasion = guessOccasion(event.title);
    const recurring = ['יום הולדת', 'יום נישואין', 'חג שמח'].includes(occasion);
    const match = matchContactForEvent(event.title);
    addPerson({
      firstName: event.title,
      eventDate: event.date,
      occasion,
      relation: 'חבר/ה',
      gender: match?.gender || 'Male',
      phone: match?.phone,
      notifyDaysBefore: 0,
      notifyHour: '09:00',
      isRecurring: recurring,
      recurrence: recurring ? 'yearly' : 'once',
      useFirstNameOnly: false
    });
    setImportedEventIds(prev => [...prev, event.id]);
    refreshPeopleList();
  };

  // Filtering people list
  const filteredPeople = people
    .filter(person => {
      const query = searchQuery.toLowerCase();
      const fullName = `${person.firstName} ${person.lastName || ''}`.toLowerCase();
      return (
        fullName.includes(query) ||
        person.relation.toLowerCase().includes(query) ||
        person.occasion.toLowerCase().includes(query) ||
        (person.notes && person.notes.toLowerCase().includes(query))
      );
    })
    .sort((a, b) => {
      const daysA = getDaysToEvent(a);
      const daysB = getDaysToEvent(b);
      // Put past one-time events at the end (days === -1)
      if (daysA === -1 && daysB !== -1) return 1;
      if (daysB === -1 && daysA !== -1) return -1;
      return daysA - daysB;
    });

  // Find today's occasions
  const todaysOccasions = people.filter(p => isEventToday(p));

  // Calendar Helper Logic
  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const handlePrevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarMonth(11);
      setCalendarYear(prev => prev - 1);
    } else {
      setCalendarMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear(prev => prev + 1);
    } else {
      setCalendarMonth(prev => prev + 1);
    }
  };

  // Render Calendar Cells
  const renderCalendarCells = () => {
    const daysInMonth = getDaysInMonth(calendarYear, calendarMonth);
    const firstDayIndex = getFirstDayOfMonth(calendarYear, calendarMonth);
    const cells = [];

    const prevMonth = calendarMonth === 0 ? 11 : calendarMonth - 1;
    const prevYear = calendarMonth === 0 ? calendarYear - 1 : calendarYear;
    const daysInPrevMonth = getDaysInMonth(prevYear, prevMonth);
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      cells.push({ day: dayNum, isCurrentMonth: false, month: prevMonth, year: prevYear });
    }

    for (let i = 1; i <= daysInMonth; i++) {
      cells.push({ day: i, isCurrentMonth: true, month: calendarMonth, year: calendarYear });
    }

    const nextMonth = calendarMonth === 11 ? 0 : calendarMonth + 1;
    const nextYear = calendarMonth === 11 ? calendarYear + 1 : calendarYear;
    const remainingCells = 42 - cells.length;
    for (let i = 1; i <= remainingCells; i++) {
      cells.push({ day: i, isCurrentMonth: false, month: nextMonth, year: nextYear });
    }

    return cells.map((cell, index) => {
      const cellEvents = people.filter(p => {
        const pDate = new Date(p.eventDate);
        pDate.setHours(0, 0, 0, 0);
        const cellDate = new Date(cell.year, cell.month, cell.day);
        cellDate.setHours(0, 0, 0, 0);

        // If the cell date is before the event start date, it cannot occur
        if (cellDate < pDate) {
          return false;
        }

        if (!p.isRecurring || p.recurrence === 'once') {
          return pDate.getFullYear() === cellDate.getFullYear() &&
                 pDate.getMonth() === cellDate.getMonth() &&
                 pDate.getDate() === cellDate.getDate();
        }

        if (p.recurrence === 'weekly') {
          return pDate.getDay() === cellDate.getDay();
        }

        if (p.recurrence === 'monthly') {
          return pDate.getDate() === cellDate.getDate();
        }

        // Yearly
        return pDate.getDate() === cellDate.getDate() && pDate.getMonth() === cellDate.getMonth();
      });

      // Pending (not-yet-imported) Google Calendar events that fall on this cell's date.
      const cellGoogleEvents = googleEvents.filter(e => {
        if (importedEventIds.includes(e.id)) return false;
        const [y, m, d] = e.date.split('-').map(Number);
        return y === cell.year && (m - 1) === cell.month && d === cell.day;
      });

      const isCellToday =
        cell.day === todayDate.getDate() &&
        cell.month === todayDate.getMonth() &&
        cell.year === todayDate.getFullYear();

      return (
        <div
          key={index}
          className={`calendar-day-cell ${cell.isCurrentMonth ? '' : 'other-month'} ${isCellToday ? 'today' : ''}`}
          onClick={() => {
            if (cell.isCurrentMonth) {
              const formattedMonth = String(cell.month + 1).padStart(2, '0');
              const formattedDay = String(cell.day).padStart(2, '0');
              setFormDate(`${cell.year}-${formattedMonth}-${formattedDay}`);
              setActiveTab('list');
            }
          }}
        >
          <span className="calendar-day-number">{cell.day}</span>
          <div className="calendar-birthdays-container">
            {cellEvents.map(p => (
              <div key={p.id} className={`calendar-birthday-dot ${getRelationCategory(p.relation)}`} title={`${p.firstName} (${p.occasion} - ${p.relation})`}>
                {getOccasionEmoji(p.occasion)} {p.firstName}
              </div>
            ))}
            {cellGoogleEvents.map(e => (
              <div
                key={e.id}
                className="calendar-birthday-dot"
                style={{ border: '1px dashed var(--secondary)', background: 'rgba(56, 189, 248, 0.12)', cursor: 'pointer' }}
                title={`לחץ/י לייבוא מיומן Google: ${e.title}`}
                onClick={(ev) => { ev.stopPropagation(); handleImportGoogleEvent(e); }}
              >
                ➕ {e.title}
              </div>
            ))}
          </div>
        </div>
      );
    });
  };

  // App Lock screen — shown when data is encrypted and not yet unlocked this session.
  if (lockState === 'locked') {
    return (
      <div className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <form onSubmit={handleUnlock} className="glass-card section-panel" style={{ maxWidth: '380px', width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🔒</div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '0.5rem' }}>האפליקציה נעולה</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
            הזן/י את סיסמת הנעילה כדי לפתוח את הנתונים המוצפנים.
          </p>
          <input
            type="password"
            className="form-input"
            autoFocus
            placeholder="סיסמה"
            value={unlockInput}
            onChange={(e) => setUnlockInput(e.target.value)}
            style={{ marginBottom: '0.75rem', textAlign: 'center' }}
          />
          {unlockError && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{unlockError}</p>}
          <button type="submit" className="btn btn-primary" disabled={unlocking || !unlockInput}>
            {unlocking ? 'פותח...' : 'פתח/י 🔓'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Dynamic Header */}
      <header ref={headerRef} className="app-header glass-card">
        <div className="logo-container">
          <span className="logo-icon">🎉</span>
          <div>
            <h1 className="logo-text" id="main-app-title">מזל טוב!</h1>
            <div className="logo-subtitle">מנהל אירועים וברכות חכמות</div>
          </div>
        </div>

        <nav className="tabs-nav" id="tabs-navigation">
          <button
            onClick={() => setActiveTab('list')}
            className={`tab-btn ${activeTab === 'list' ? 'active' : ''}`}
            id="tab-contacts"
          >
            <Users size={18} />
            <span>אנשי קשר</span>
          </button>
          <button
            onClick={() => setActiveTab("calendar")}
            className={`tab-btn ${activeTab === "calendar" ? "active" : ""}`}
            id="tab-calendar"
          >
            <CalendarIcon size={18} />
            <span>לוח שנה</span>
          </button>
          <button
            onClick={handleOpenQuickGenerator}
            className={`tab-btn ${activeTab === "quick-generate" ? "active" : ""}`}
            id="tab-quick-generate"
          >
            <Sparkles size={18} />
            <span>מחולל מהיר</span>
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
            id="tab-settings"
          >
            <SettingsIcon size={18} />
            <span>הגדרות</span>
          </button>
        </nav>
      </header>

      {/* Birthday Alert Banner */}
      {todaysOccasions.length > 0 && activeTab !== 'settings' && (
        <div className="today-alert-banner glass-card" id="birthday-alert-banner">
          <div className="alert-content">
            <span className="alert-emoji">🥳</span>
            <div>
              <h2 className="alert-title">היום יש אירוע!</h2>
              <p className="alert-desc">
                {todaysOccasions.map((p, idx) => (
                  <span key={p.id} style={{ fontWeight: 'bold' }}>
                    {getOccasionEmoji(p.occasion)} {p.occasion} של {p.firstName} {p.lastName || ''} ({p.relation})!
                    {idx < todaysOccasions.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </p>
            </div>
          </div>
          <div className="alert-actions">
            {todaysOccasions.map(p => (
              <button
                key={p.id}
                onClick={() => handleOpenGreeting(p)}
                className="btn btn-primary"
                style={{ width: 'auto' }}
              >
                <Sparkles size={16} />
                <span>ברכה ל{p.firstName}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tab Contents */}
      <main>
        {activeTab === 'list' && (
          <div className="main-grid">
            {/* Sidebar Form */}
            <section className="glass-card section-panel" id="add-edit-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <h2 className="form-title" id="form-heading" style={{ marginBottom: 0 }}>
                  {editingPerson ? <Edit size={20} /> : <Plus size={20} />}
                  <span>{editingPerson ? 'עריכת אירוע' : 'הוספת אירוע'}</span>
                </h2>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleNewEvent}
                  style={{ width: 'auto', padding: '0.4rem 0.7rem', fontSize: '0.8rem', flexShrink: 0 }}
                  title="נקה את הטופס והתחל אירוע חדש"
                >
                  <Plus size={14} />
                  <span>אירוע חדש</span>
                </button>
              </div>

              <form onSubmit={handleSubmitPerson}>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => openContactsModal('form')}
                    style={{ fontSize: '0.8rem', padding: '0.5rem 0.75rem' }}
                  >
                    <Import size={14} />
                    <span>ייבוא מאנשי קשר 📱</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleOpenCalendarSync}
                    style={{ fontSize: '0.8rem', padding: '0.5rem 0.75rem' }}
                  >
                    <CalendarIcon size={14} />
                    <span>סנכרון מיומן 📅</span>
                  </button>
                </div>

                {/* Feature 3: Separate First Name and Surname */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" htmlFor="input-first-name">שם פרטי</label>
                    <input
                      id="input-first-name"
                      type="text"
                      required
                      className="form-input"
                      placeholder="ישראל"
                      value={formFirstName}
                      onChange={(e) => setFormFirstName(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" htmlFor="input-last-name">שם משפחה</label>
                    <input
                      id="input-last-name"
                      type="text"
                      className="form-input"
                      placeholder="ישראלי"
                      value={formLastName}
                      onChange={(e) => setFormLastName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="select-occasion">סוג האירוע</label>
                  <select
                    id="select-occasion"
                    className="form-select"
                    value={(OCCASIONS.includes(formOccasion as typeof OCCASIONS[number]) && formOccasion !== 'אחר') ? formOccasion : 'אחר'}
                    onChange={(e) => setFormOccasion(e.target.value === 'אחר' ? '' : e.target.value)}
                  >
                    {OCCASIONS.map(o => (
                      <option key={o} value={o}>{o === 'אחר' ? 'אחר (טקסט חופשי)' : o}</option>
                    ))}
                  </select>
                  {(!OCCASIONS.includes(formOccasion as typeof OCCASIONS[number]) || formOccasion === 'אחר') && (
                    <input
                      type="text"
                      className="form-input"
                      style={{ marginTop: '0.5rem' }}
                      placeholder="הקלד/י סוג אירוע מותאם אישית (למשל: בר מצווה, פרישה...)"
                      value={formOccasion === 'אחר' ? '' : formOccasion}
                      onChange={(e) => setFormOccasion(e.target.value)}
                    />
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="input-date">תאריך האירוע</label>
                  <input
                    id="input-date"
                    type="date"
                    required
                    className="form-input numbers-font"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                  />
                </div>

                {/* Feature 1: Event Periodicity Dropdown */}
                <div className="form-group">
                  <label className="form-label" htmlFor="select-recurrence-type">מחזוריות האירוע</label>
                  <select
                    id="select-recurrence-type"
                    className="form-select"
                    value={!formIsRecurring || formRecurrence === 'once' ? 'once' : formRecurrence}
                    onChange={(e) => {
                      const val = e.target.value as 'yearly' | 'monthly' | 'weekly' | 'once';
                      if (val === 'once') {
                        setFormIsRecurring(false);
                        setFormRecurrence('once');
                      } else {
                        setFormIsRecurring(true);
                        setFormRecurrence(val);
                      }
                    }}
                  >
                    <option value="once">אירוע חד-פעמי (ללא חזרה)</option>
                    <option value="yearly">שנתי (חוזר כל שנה)</option>
                    <option value="monthly">חודשי (חוזר כל חודש)</option>
                    <option value="weekly">שבועי (חוזר כל שבוע)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="select-relation">מערכת יחסים</label>
                  <select
                    id="select-relation"
                    className="form-select"
                    value={(RELATIONS.includes(formRelation) && formRelation !== 'אחר') ? formRelation : 'אחר'}
                    onChange={(e) => e.target.value === 'אחר' ? setFormRelation('') : handleRelationChange(e.target.value)}
                  >
                    {RELATIONS.map(r => (
                      <option key={r} value={r}>{r === 'אחר' ? 'אחר (טקסט חופשי)' : r}</option>
                    ))}
                  </select>
                  {(!RELATIONS.includes(formRelation) || formRelation === 'אחר') && (
                    <input
                      type="text"
                      className="form-input"
                      style={{ marginTop: '0.5rem' }}
                      placeholder="הקלד/י קשר מותאם אישית (למשל: מנהל/ת, מורה, בן/בת דוד שני...)"
                      value={formRelation === 'אחר' ? '' : formRelation}
                      onChange={(e) => setFormRelation(e.target.value)}
                    />
                  )}
                </div>

                {/* Feature 3: Surname omission check */}
                <div className="form-group">
                  <label className="gender-radio-label">
                    <input
                      type="checkbox"
                      checked={formUseFirstNameOnly}
                      onChange={(e) => setFormUseFirstNameOnly(e.target.checked)}
                      style={{ width: '18px', height: '18px', accentColor: 'var(--primary)' }}
                    />
                    <span>השתמש בשם פרטי בלבד בברכה</span>
                  </label>
                </div>

                <div className="form-group">
                  <label className="form-label">מגדר (עבור דקדוק הברכה)</label>
                  <div className="gender-radio-group">
                    <label className="gender-radio-label">
                      <input
                        type="radio"
                        name="gender"
                        className="gender-radio-input"
                        checked={formGender === 'Male'}
                        onChange={() => setFormGender('Male')}
                      />
                      <span>זכר</span>
                    </label>
                    <label className="gender-radio-label">
                      <input
                        type="radio"
                        name="gender"
                        className="gender-radio-input"
                        checked={formGender === 'Female'}
                        onChange={() => setFormGender('Female')}
                      />
                      <span>נקבה</span>
                    </label>
                    <label className="gender-radio-label">
                      <input
                        type="radio"
                        name="gender"
                        className="gender-radio-input"
                        checked={formGender === 'Couple'}
                        onChange={() => setFormGender('Couple')}
                      />
                      <span>זוג / רבים</span>
                    </label>
                  </div>
                  {formGender === 'Couple' && (
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                      הברכה תנוסח בלשון רבים — מתאים לבני זוג או לקבוצה (למשל ברכת יום נישואין להורים).
                    </p>
                  )}
                </div>

                {/* Proxy delivery */}
                <div className="form-group" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.75rem', marginTop: '0.75rem' }}>
                  <label className="gender-radio-label">
                    <input
                      type="checkbox"
                      checked={formViaProxy}
                      onChange={(e) => setFormViaProxy(e.target.checked)}
                      style={{ width: '18px', height: '18px', accentColor: 'var(--primary)' }}
                    />
                    <span>שליחת הברכה דרך מישהו אחר (פרוקסי)</span>
                  </label>
                  {formViaProxy && (
                    <div style={{ marginTop: '0.6rem', padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--panel-border)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0, lineHeight: '1.4' }}>
                        הברכה תופנה אל מקבל/ת הברכה (למשל אח/ות או קבוצת משפחה) ותברך אותו/ה לרגל האירוע של <strong>{formFirstName || 'בעל האירוע'}</strong>. הטלפון למעלה ישמש לשליחה אל מקבל/ת הברכה.
                      </p>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>שם מקבל/ת הברכה (למי לשלוח)</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="למשל: דני / משפחת כהן"
                          value={formProxyName}
                          onChange={(e) => setFormProxyName(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>מגדר מקבל/ת הברכה</label>
                        <div className="gender-radio-group">
                          <label className="gender-radio-label" style={{ fontSize: '0.8rem' }}>
                            <input type="radio" name="proxyGender" className="gender-radio-input" checked={formProxyGender === 'Male'} onChange={() => setFormProxyGender('Male')} />
                            <span>זכר</span>
                          </label>
                          <label className="gender-radio-label" style={{ fontSize: '0.8rem' }}>
                            <input type="radio" name="proxyGender" className="gender-radio-input" checked={formProxyGender === 'Female'} onChange={() => setFormProxyGender('Female')} />
                            <span>נקבה</span>
                          </label>
                          <label className="gender-radio-label" style={{ fontSize: '0.8rem' }}>
                            <input type="radio" name="proxyGender" className="gender-radio-input" checked={formProxyGender === 'Couple'} onChange={() => setFormProxyGender('Couple')} />
                            <span>זוג / רבים</span>
                          </label>
                        </div>
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>הקשר של בעל/ת האירוע למקבל/ת הברכה (אופציונלי)</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="למשל: הבן שלך, הנכדה שלכם"
                          value={formCelebrantLink}
                          onChange={(e) => setFormCelebrantLink(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="form-group" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.75rem', marginTop: '0.75rem' }}>
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--primary)' }}>
                    <Bell size={14} />
                    <span>הגדרות התראה (אנדרואיד / דפדפן)</span>
                  </label>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.4rem' }}>
                    <div>
                      <label className="form-label" htmlFor="select-notify-days" style={{ fontSize: '0.75rem' }}>מועד ההתראה</label>
                      <select
                        id="select-notify-days"
                        className="form-select"
                        style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                        value={formNotifyDays}
                        onChange={(e) => setFormNotifyDays(Number(e.target.value))}
                      >
                        <option value={0}>ביום האירוע</option>
                        <option value={1}>יום לפני</option>
                        <option value={2}>יומיים לפני</option>
                        <option value={7}>שבוע לפני</option>
                      </select>
                    </div>

                    <div>
                      <label className="form-label" htmlFor="input-notify-hour" style={{ fontSize: '0.75rem' }}>שעת ההתראה</label>
                      <input
                        id="input-notify-hour"
                        type="time"
                        className="form-input numbers-font"
                        style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                        value={formNotifyHour}
                        onChange={(e) => setFormNotifyHour(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: '0.75rem' }}>
                  <label className="form-label" htmlFor="input-phone">טלפון לשליחה בוואטסאפ (אופציונלי)</label>
                  <input
                    id="input-phone"
                    type="tel"
                    className="form-input numbers-font"
                    placeholder="050-1234567"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="input-notes">הערות נוספות (תחביבים, איחולים מיוחדים)</label>
                  <textarea
                    id="input-notes"
                    rows={2}
                    className="form-textarea"
                    placeholder="אוהב שוקולד, קודם לאחרונה, מאחל לו הצלחה..."
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                  <button type="submit" className="btn btn-primary" id="btn-submit-form">
                    {editingPerson ? 'שמור שינויים' : 'הוסף אירוע'}
                  </button>
                  {editingPerson && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={resetForm}
                    >
                      ביטול
                    </button>
                  )}
                </div>
              </form>
            </section>

            {/* List Section */}
            <section className="glass-card section-panel" id="contacts-list-section">
              <div className="list-sticky-header">
                <div className="panel-header" style={{ marginBottom: '1rem' }}>
                  <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>לוח אירועים מתוכננים</h2>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }} className="numbers-font">
                    {filteredPeople.length} מתוך {people.length}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch' }}>
                  <div className="search-container" style={{ marginBottom: 0, flex: 1 }}>
                    <input
                      type="text"
                      className="form-input search-input"
                      placeholder="חיפוש לפי שם, קשר, אירוע או הערות..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      id="search-contacts-input"
                    />
                    <Search className="search-icon" size={18} />
                  </div>
                  <button
                    type="button"
                    className="icon-btn"
                    title="גלילה למעלה"
                    onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                    style={{ flexShrink: 0 }}
                  >
                    <ArrowUp size={18} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title="גלילה לתחתית"
                    onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })}
                    style={{ flexShrink: 0 }}
                  >
                    <ArrowDown size={18} />
                  </button>
                </div>
              </div>

              <div className="people-grid" id="contacts-grid">
                {filteredPeople.map((person) => {
                  const daysLeft = getDaysToEvent(person);
                  const years = calculateYears(person.eventDate);
                  
                  let daysBadgeClass = 'far';
                  let daysBadgeText = '';
                  
                  if (daysLeft === -1) {
                    daysBadgeClass = 'far';
                    daysBadgeText = 'אירוע עבר (חד פעמי)';
                  } else if (daysLeft === 0) {
                    daysBadgeClass = 'today';
                    daysBadgeText = 'היום! 🥳';
                  } else if (daysLeft === 1) {
                    daysBadgeClass = 'soon';
                    daysBadgeText = 'מחר! ⏳';
                  } else if (daysLeft <= 14) {
                    daysBadgeClass = 'soon';
                    daysBadgeText = `בעוד ${daysLeft} ימים ⏳`;
                  } else {
                    daysBadgeClass = 'far';
                    daysBadgeText = `בעוד ${daysLeft} ימים`;
                  }

                  const relationClass = getRelationCategory(person.relation);

                  return (
                    <div key={person.id} className={`person-card glass-card ${relationClass}`}>
                      <div className="person-card-header">
                        <div className="person-name">
                          <span style={{ fontSize: '1.2rem', marginRight: '2px' }}>{getOccasionEmoji(person.occasion)}</span>
                          <span>{person.firstName} {person.lastName || ''}</span>
                          <span className={`gender-badge ${person.gender === 'Female' ? 'female' : 'male'}`}>
                            {getGenderLabel(person.gender)}
                          </span>
                        </div>
                        <span className="person-relation">{person.relation}</span>
                      </div>

                      <div className="person-birthday-row">
                        <CalendarIcon size={14} />
                        <span className="numbers-font">{person.eventDate.split('-').reverse().join('/')}</span>
                        <span style={{ opacity: 0.5 }}>|</span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary)' }}>
                          {person.occasion} {years > 0 ? `(${years})` : ''}
                        </span>
                      </div>

                      <div className="person-birthday-row" style={{ fontSize: '0.75rem', opacity: 0.85 }}>
                        <span style={{ background: 'rgba(255,255,255,0.03)', padding: '0.1rem 0.4rem', borderRadius: '4px', border: '1px solid var(--panel-border)' }}>
                          {person.isRecurring ? `מחזורי (${person.recurrence === 'yearly' ? 'שנתי' : person.recurrence === 'monthly' ? 'חודשי' : 'שבועי'})` : 'אירוע חד פעמי'}
                        </span>
                      </div>

                      {person.phone && (
                        <div className="person-birthday-row" style={{ fontSize: '0.8rem' }}>
                          <Phone size={12} />
                          <span className="phone-number" dir="ltr">{person.phone}</span>
                        </div>
                      )}

                      <div className="person-birthday-row" style={{ fontSize: '0.75rem', opacity: 0.85 }}>
                        <Bell size={12} style={{ color: 'var(--warning)' }} />
                        <span>התראה: {person.notifyDaysBefore === 0 ? 'ביום האירוע' : person.notifyDaysBefore === 1 ? 'יום לפני' : `${person.notifyDaysBefore} ימים לפני`} בשעה <span className="numbers-font">{person.notifyHour}</span></span>
                      </div>

                      {person.notes && (
                        <div className="person-birthday-row" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                          <FileText size={12} style={{ flexShrink: 0 }} />
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {person.notes}
                          </span>
                        </div>
                      )}

                      <div className="person-age-days">
                        <span className={`days-badge ${daysBadgeClass}`}>{daysBadgeText}</span>
                        
                        <div className="card-actions">
                          <button
                            onClick={() => handleOpenGreeting(person)}
                            className="btn btn-primary"
                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', width: 'auto' }}
                            title="צור ברכה חכמה"
                          >
                            <Sparkles size={14} />
                            <span>ברכה ✨</span>
                          </button>

                          <button
                            onClick={() => handleStartEdit(person)}
                            className="icon-btn"
                            title="ערוך איש קשר"
                          >
                            <Edit size={16} />
                          </button>

                          <button
                            onClick={() => handleDeletePerson(person.id, person.firstName)}
                            className="icon-btn delete"
                            title="מחק איש קשר"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {filteredPeople.length === 0 && (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                  לא נמצאו אירועים מתאימים לחיפוש.
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === 'calendar' && (
          <section className="glass-card section-panel calendar-view-container" id="calendar-section">
            <div className="calendar-header">
              <button onClick={handleNextMonth} className="calendar-nav-btn" title="חודש הבא">
                <ChevronRight size={20} />
              </button>
              <h2 className="calendar-title-text" id="calendar-month-year">
                {HEBREW_MONTHS[calendarMonth]} {calendarYear}
              </h2>
              <button onClick={handlePrevMonth} className="calendar-nav-btn" title="חודש קודם">
                <ChevronLeft size={20} />
              </button>
            </div>

            {/* Google Calendar sync bar */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: 'auto', fontSize: '0.85rem' }}
                onClick={syncGoogleCalendar}
                disabled={calendarLoading}
              >
                {calendarLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px', margin: 0 }}></div>
                    <span>מסנכרן...</span>
                  </div>
                ) : (
                  <>
                    <CalendarIcon size={14} />
                    <span>סנכרן אירועים מיומן Google</span>
                  </>
                )}
              </button>
              {(() => {
                if (calendarError === 'not-connected') {
                  return (
                    <button type="button" className="btn btn-primary" style={{ width: 'auto', fontSize: '0.8rem', padding: '0.4rem 0.8rem', background: '#4285F4' }} onClick={() => handleGoogleLoginFor('calendar')} disabled={isLoggingIn}>
                      <LogIn size={14} />
                      <span>{isLoggingIn ? 'מתחבר...' : 'התחבר/י עם Google'}</span>
                    </button>
                  );
                }
                if (calendarError) {
                  return <span style={{ fontSize: '0.8rem', color: 'var(--danger, #ff5c5c)' }}>{calendarError}</span>;
                }
                if (!calendarLoading && googleEvents.length > 0) {
                  const pending = googleEvents.filter(e => !importedEventIds.includes(e.id)).length;
                  return (
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {pending > 0 ? `נמצאו ${pending} אירועים — לחץ/י על אירוע מקווקו בלוח כדי לייבא ➕` : 'כל האירועים יובאו 🎉'}
                    </span>
                  );
                }
                return null;
              })()}
            </div>

            <div className="calendar-days-grid">
              {WEEKDAYS.map(d => (
                <div key={d} className="calendar-weekday-label">{d}</div>
              ))}
              {renderCalendarCells()}
            </div>
            
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', gap: '1.5rem', justifyContent: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--accent)' }}></span>
                <span>בן/בת זוג</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--primary)' }}></span>
                <span>משפחה</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--secondary)' }}></span>
                <span>חברים ואחרים</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '3px', border: '1px dashed var(--secondary)', background: 'rgba(56, 189, 248, 0.12)' }}></span>
                <span>אירוע מ-Google (לחץ לייבוא)</span>
              </span>
            </div>
          </section>
        )}

        {activeTab === 'quick-generate' && (
          <section className="glass-card section-panel" id="quick-generate-section">
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Sparkles size={22} style={{ color: 'var(--primary)' }} />
              <span>מחולל ברכות מהיר (על פי דרישה) ⚡</span>
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              יצירת ברכה חכמה בעברית ללא רישום במסד הנתונים. מלא/י את הפרטים וקבל/י ברכה מותאמת אישית.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem', padding: '1rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--secondary)', marginBottom: 0 }}>פרטי מקבל הברכה:</h4>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => openContactsModal('quick')}
                  style={{ width: 'auto', fontSize: '0.78rem', padding: '0.35rem 0.7rem', flexShrink: 0 }}
                >
                  <Import size={13} />
                  <span>ייבוא מאנשי קשר 📱</span>
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>שם פרטי</label>
                  <input
                    type="text"
                    className="form-input"
                    style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                    placeholder="ישראל"
                    value={quickFirstName}
                    onChange={(e) => setQuickFirstName(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>שם משפחה (אופציונלי)</label>
                  <input
                    type="text"
                    className="form-input"
                    style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                    placeholder="ישראלי"
                    value={quickLastName}
                    onChange={(e) => setQuickLastName(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 0.8fr', gap: '0.75rem', alignItems: 'end' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>סוג האירוע</label>
                  <select
                    className="form-select"
                    style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                    value={quickOccasion}
                    onChange={(e) => setQuickOccasion(e.target.value as any)}
                  >
                    {OCCASIONS.map(o => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>
                
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>קשר משפחתי/חברתי</label>
                  <select
                    className="form-select"
                    style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                    value={quickRelation}
                    onChange={(e) => handleQuickRelationChange(e.target.value)}
                  >
                    {RELATIONS.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>גיל/שנים</label>
                  <input
                    type="number"
                    className="form-input numbers-font"
                    style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                    min={1}
                    max={120}
                    value={quickYears}
                    onChange={(e) => setQuickYears(Number(e.target.value))}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
                <div className="gender-radio-group" style={{ gap: '1rem' }}>
                  <label className="gender-radio-label" style={{ fontSize: '0.8rem' }}>
                    <input
                      type="radio"
                      name="quickGender"
                      className="gender-radio-input"
                      checked={quickGender === 'Male'}
                      onChange={() => setQuickGender('Male')}
                    />
                    <span>זכר</span>
                  </label>
                  <label className="gender-radio-label" style={{ fontSize: '0.8rem' }}>
                    <input
                      type="radio"
                      name="quickGender"
                      className="gender-radio-input"
                      checked={quickGender === 'Female'}
                      onChange={() => setQuickGender('Female')}
                    />
                    <span>נקבה</span>
                  </label>
                  <label className="gender-radio-label" style={{ fontSize: '0.8rem' }}>
                    <input
                      type="radio"
                      name="quickGender"
                      className="gender-radio-input"
                      checked={quickGender === 'Couple'}
                      onChange={() => setQuickGender('Couple')}
                    />
                    <span>זוג / רבים</span>
                  </label>
                </div>

                <label className="gender-radio-label" style={{ fontSize: '0.8rem' }}>
                  <input
                    type="checkbox"
                    checked={quickUseFirstNameOnly}
                    onChange={(e) => setQuickUseFirstNameOnly(e.target.checked)}
                    style={{ width: '15px', height: '15px', accentColor: 'var(--primary)' }}
                  />
                  <span>שם פרטי בלבד בברכה</span>
                </label>
              </div>

              <label className="gender-radio-label" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                <input
                  type="checkbox"
                  checked={quickViaProxy}
                  onChange={(e) => setQuickViaProxy(e.target.checked)}
                  style={{ width: '15px', height: '15px', accentColor: 'var(--primary)' }}
                />
                <span>שליחה דרך מישהו אחר (פרוקסי)</span>
              </label>
              {quickViaProxy && (
                <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '0.6rem', alignItems: 'end', padding: '0.6rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.72rem' }}>שם מקבל/ת הברכה</label>
                    <input
                      type="text"
                      className="form-input"
                      style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                      placeholder="למשל: דני / משפחת כהן"
                      value={quickProxyName}
                      onChange={(e) => setQuickProxyName(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.72rem' }}>מגדר המקבל/ת</label>
                    <select
                      className="form-select"
                      style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                      value={quickProxyGender}
                      onChange={(e) => setQuickProxyGender(e.target.value as Person['gender'])}
                    >
                      <option value="Male">זכר</option>
                      <option value="Female">נקבה</option>
                      <option value="Couple">זוג / רבים</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                    <label className="form-label" style={{ fontSize: '0.72rem' }}>הקשר של בעל/ת האירוע למקבל/ת (אופציונלי)</label>
                    <input
                      type="text"
                      className="form-input"
                      style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                      placeholder="למשל: הבן שלך, הנכדה שלכם"
                      value={quickCelebrantLink}
                      onChange={(e) => setQuickCelebrantLink(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleGenerateOnDemand}
                className="btn btn-primary"
                style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', marginTop: '0.25rem' }}
                disabled={isGenerating}
              >
                <Sparkles size={14} />
                <span>ייצר ברכה מהירה באמצעות AI ✨</span>
              </button>
            </div>

            {/* Preview Box */}
            <div className={`greeting-preview-box ${isGenerating ? 'loading' : ''}`} id="greeting-preview-box" style={{ minHeight: '180px', marginBottom: '1.5rem' }}>
              {isGenerating ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div className="spinner"></div>
                  <span>מנסח ברכה בעברית...</span>
                </div>
              ) : (
                <textarea
                  className="greeting-edit-textarea"
                  value={greetingText}
                  onChange={(e) => setGreetingText(e.target.value)}
                  placeholder='הברכה תופיע כאן וניתנת לעריכה ידנית לפני העתקה / שליחה. מלא/י את הפרטים ולחץ/י על "ייצר ברכה".'
                  dir="rtl"
                />
              )}
            </div>

            {greetingError && !isGenerating && (
              <div style={{ marginBottom: '1.25rem', padding: '0.6rem 0.85rem', borderRadius: '8px', background: 'rgba(255,92,92,0.08)', border: '1px solid rgba(255,92,92,0.35)', color: '#ff9b9b', fontSize: '0.78rem', lineHeight: '1.45', direction: 'rtl' }}>
                ⚠️ {greetingError}
              </div>
            )}

            {/* Control Panel */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1.25rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem' }}>התאמת הברכה מחדש:</h3>
              
              <div className="greeting-options-grid">
                <div className="form-group">
                  <label className="form-label">סגנון / טון הברכה</label>
                  <div className="tone-selector-buttons">
                    <button
                      className={`tone-btn ${greetingTone === 'normal' ? 'active' : ''}`}
                      onClick={() => {
                        setGreetingTone('normal');
                        handleRegenerateGreeting('normal', customGreetingDetails);
                      }}
                    >
                      חם / רגיל
                    </button>
                    <button
                      className={`tone-btn ${greetingTone === 'funny' ? 'active' : ''}`}
                      onClick={() => {
                        setGreetingTone('funny');
                        handleRegenerateGreeting('funny', customGreetingDetails);
                      }}
                    >
                      מצחיק
                    </button>
                    <button
                      className={`tone-btn ${greetingTone === 'emotional' ? 'active' : ''}`}
                      onClick={() => {
                        setGreetingTone('emotional');
                        handleRegenerateGreeting('emotional', customGreetingDetails);
                      }}
                    >
                      מרגש
                    </button>
                    <button
                      className={`tone-btn ${greetingTone === 'short' ? 'active' : ''}`}
                      onClick={() => {
                        setGreetingTone('short');
                        handleRegenerateGreeting('short', customGreetingDetails);
                      }}
                    >
                      קצר
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="custom-instruction">הנחיה מיוחדת ל-AI (למשל: "תאחל לו טיול מוצלח")</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <textarea
                      id="custom-instruction"
                      rows={5} /* Increased rows for better visibility */
                      className="form-textarea"
                      style={{ fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}
                      placeholder="הוסף בקשה מיוחדת, פרטים ספציפיים שחשוב לכלול או איחולים ייחודיים..."
                      value={customGreetingDetails}
                      onChange={(e) => setCustomGreetingDetails(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ width: '100%', padding: '0.5rem 1rem' }}
                      onClick={() => handleRegenerateGreeting(greetingTone, customGreetingDetails)}
                      disabled={!quickFirstName.trim() && !customGreetingDetails.trim()}
                    >
                      עדכן ונסח מחדש באמצעות AI 🪄
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={handleCopyGreeting}
                disabled={isGenerating || !greetingText}
                id="btn-copy-greeting"
              >
                <Copy size={16} />
                <span>{copyFeedback ? 'הועתק! 🗸' : 'העתק ברכה'}</span>
              </button>

              <button
                type="button"
                className="btn btn-primary btn-success"
                style={{ flex: 1 }}
                onClick={handleWhatsAppSend}
                disabled={isGenerating || !greetingText}
                id="btn-send-whatsapp"
              >
                <Sparkles size={16} />
                <span>שלח בוואטסאפ</span>
              </button>
            </div>
          </section>
        )}

        {activeTab === 'settings' && (
          <section className="glass-card section-panel settings-panel" id="settings-section">
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '1rem' }}>הגדרות האפליקציה</h2>
            
            {/* Google Authentication Box */}
            <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '2rem', border: '1px solid rgba(138,43,226,0.2)' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <LogIn size={20} style={{ color: 'var(--secondary)' }} />
                <span>התחברות מאובטחת בחשבון גוגל (Google Login)</span>
              </h3>
              <p className="settings-description" style={{ fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                התחברות עם חשבון גוגל מאפשרת לייבא אירועים מיומן Google ואנשי קשר (בהרשאתך בלבד, קריאה בלבד).
                שים/י לב: ההתחברות אינה מספקת גישה ל-Gemini — ליצירת ברכות AI נדרש מפתח API נפרד (ראה/י למטה).
              </p>

              {settings.useGoogleAuth ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0, 230, 118, 0.08)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--success)' }}>
                  <div>
                    <div style={{ fontWeight: 'bold', color: 'var(--success)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <CheckCircle size={16} />
                      <span>מחובר בהצלחה באמצעות Google</span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                      שם: {settings.googleUserName} ({settings.googleUserEmail})
                    </div>
                  </div>
                  <button 
                    onClick={handleGoogleLogout}
                    className="btn btn-secondary" 
                    style={{ width: 'auto', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  >
                    <LogOut size={14} />
                    <span>התנתק</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  className="btn btn-primary"
                  style={{ background: '#4285F4', width: 'auto', boxShadow: 'none' }}
                  disabled={isLoggingIn}
                >
                  {isLoggingIn ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', margin: 0 }}></div>
                      <span>מתחבר...</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <svg width="18" height="18" viewBox="0 0 18 18">
                        <path fill="#fff" d="M17.64 9.2c0-.63-.06-1.25-.16-1.84H9v3.47h4.84c-.21 1.12-.84 2.07-1.8 2.72v2.24h2.9c1.7-1.57 2.7-3.87 2.7-6.59z"/>
                        <path fill="#fff" d="M9 18c2.43 0 4.47-.8 5.96-2.2l-2.9-2.24c-.8.54-1.84.87-3.06.87-2.35 0-4.34-1.58-5.05-3.72H.95v2.3C2.43 15.89 5.5 18 9 18z"/>
                        <path fill="#fff" d="M3.95 10.71a5.4 5.4 0 0 1 0-3.42V4.99H.95a9 9 0 0 0 0 8.02l3-2.3z"/>
                        <path fill="#fff" d="M9 3.58c1.32 0 2.5.45 3.44 1.35L15 2.4A9 9 0 0 0 .95 4.99l3 2.3C4.66 5.17 6.65 3.58 9 3.58z"/>
                      </svg>
                      <span>התחברות מהירה עם Google</span>
                    </div>
                  )}
                </button>
              )}
            </div>

            {/* App Lock (at-rest encryption) */}
            <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '2rem', border: '1px solid rgba(0, 230, 118, 0.15)' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>🔒</span>
                <span>נעילת אפליקציה (הצפנת נתונים)</span>
              </h3>
              <p className="settings-description" style={{ fontSize: '0.85rem', marginBottom: '1rem', lineHeight: '1.5' }}>
                הצפנת כל הנתונים במכשיר (אנשי קשר, מספרי טלפון ומפתחות API) באמצעות סיסמה. בכל פתיחה של האפליקציה תידרש/י להזין אותה.
              </p>

              {lockEnabled ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--success)', fontWeight: 'bold', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <CheckCircle size={16} />
                    הנעילה פעילה — הנתונים מוצפנים.
                  </span>
                  <button type="button" className="btn btn-secondary" style={{ width: 'auto' }} onClick={handleDisableLock}>
                    בטל/י נעילה
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="סיסמת נעילה חדשה"
                    value={newPassphrase}
                    onChange={(e) => { setNewPassphrase(e.target.value); setLockSetupError(''); }}
                  />
                  <input
                    type="password"
                    className="form-input"
                    placeholder="אישור סיסמה"
                    value={confirmPassphrase}
                    onChange={(e) => { setConfirmPassphrase(e.target.value); setLockSetupError(''); }}
                  />
                  {lockSetupError && <p style={{ color: 'var(--danger)', fontSize: '0.82rem', margin: 0 }}>{lockSetupError}</p>}
                  <p style={{ fontSize: '0.72rem', color: 'var(--warning)', margin: 0, lineHeight: '1.4' }}>
                    ⚠️ שמור/י את הסיסמה במקום בטוח — אם תישכח, לא ניתן יהיה לשחזר את הנתונים המוצפנים.
                  </p>
                  <button type="button" className="btn btn-primary" style={{ width: 'auto' }} onClick={handleEnableLock} disabled={!newPassphrase || !confirmPassphrase}>
                    הפעל/י נעילה
                  </button>
                </div>
              )}
            </div>

            <form onSubmit={handleSaveSettings}>
              <div className="form-group" style={{ paddingBottom: '1.25rem', marginBottom: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <label className="form-label">המגדר שלך (כותב/ת הברכה) — חשוב לדקדוק העברי</label>
                <div className="gender-radio-group">
                  <label className="gender-radio-label">
                    <input
                      type="radio"
                      name="senderGender"
                      className="gender-radio-input"
                      checked={(settings.senderGender || 'Male') === 'Male'}
                      onChange={() => setLocalSettings({ ...settings, senderGender: 'Male' })}
                    />
                    <span>זכר (מאחל)</span>
                  </label>
                  <label className="gender-radio-label">
                    <input
                      type="radio"
                      name="senderGender"
                      className="gender-radio-input"
                      checked={settings.senderGender === 'Female'}
                      onChange={() => setLocalSettings({ ...settings, senderGender: 'Female' })}
                    />
                    <span>נקבה (מאחלת)</span>
                  </label>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem', lineHeight: '1.4' }}>
                  הברכות נכתבות בגוף ראשון — הגדרה זו קובעת אם ייכתב "מאחל" או "מאחלת". זכור/י ללחוץ "שמור הגדרות".
                </p>

                <label className="form-label" style={{ marginTop: '0.9rem' }}>השם שלך (לחתימת הברכה)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="למשל: דנה"
                  value={settings.senderName || ''}
                  onChange={(e) => setLocalSettings({ ...settings, senderName: e.target.value })}
                />
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem', lineHeight: '1.4' }}>
                  אם תזין/י שם, הברכות ייחתמו בו (למשל: "באהבה, דנה"). השאר/י ריק לברכה ללא חתימה.
                </p>
              </div>

              <div className="form-group">
                <label className="form-label">ספק הבינה המלאכותית (AI)</label>
                <div className="gender-radio-group">
                  <label className="gender-radio-label">
                    <input
                      type="radio"
                      name="aiProvider"
                      className="gender-radio-input"
                      checked={(settings.aiProvider || 'gemini') === 'gemini'}
                      onChange={() => { setLocalSettings({ ...settings, aiProvider: 'gemini' as AiProvider }); setKeyTestStatus('idle'); setKeyTestError(''); }}
                    />
                    <span>Google Gemini</span>
                  </label>
                  <label className="gender-radio-label">
                    <input
                      type="radio"
                      name="aiProvider"
                      className="gender-radio-input"
                      checked={settings.aiProvider === 'groq'}
                      onChange={() => { setLocalSettings({ ...settings, aiProvider: 'groq' as AiProvider }); setKeyTestStatus('idle'); setKeyTestError(''); }}
                    />
                    <span>Groq (חינמי) ⚡</span>
                  </label>
                  <label className="gender-radio-label">
                    <input
                      type="radio"
                      name="aiProvider"
                      className="gender-radio-input"
                      checked={settings.aiProvider === 'openrouter'}
                      onChange={() => { setLocalSettings({ ...settings, aiProvider: 'openrouter' as AiProvider }); setKeyTestStatus('idle'); setKeyTestError(''); }}
                    />
                    <span>OpenRouter (Gemma חינמי) 🧩</span>
                  </label>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem', lineHeight: '1.4' }}>
                  לכל ספק מפתח API נפרד. ללא מפתח — האפליקציה משתמשת בברכות תבנית מובנות (חינם, ללא AI).
                </p>
              </div>

              {(settings.aiProvider || 'gemini') === 'gemini' && (
                <>
                  <div className="form-group">
                    <label className="form-label" htmlFor="input-api-key"><span>מפתח API של Google Gemini</span></label>
                    <div className="api-key-input-container">
                      <input
                        id="input-api-key"
                        type={showApiKey ? 'text' : 'password'}
                        className="form-input numbers-font"
                        placeholder="AIzaSy..."
                        style={{ paddingLeft: '3rem' }}
                        value={settings.geminiApiKey}
                        onChange={(e) => { setLocalSettings({ ...settings, geminiApiKey: e.target.value }); setKeyTestStatus('idle'); setKeyTestError(''); }}
                      />
                      <button type="button" className="api-key-toggle-btn" onClick={() => setShowApiKey(!showApiKey)}>
                        {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem', lineHeight: '1.4' }}>🔒 המפתח נשמר רק במכשיר שלך — הוא לא נשלח לאף שרת חיצוני.</p>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="select-gemini-model">מודל Gemini</label>
                    <select id="select-gemini-model" className="form-select" value={settings.geminiModel || DEFAULT_GEMINI_MODEL} onChange={(e) => { setLocalSettings({ ...settings, geminiModel: e.target.value }); setKeyTestStatus('idle'); setKeyTestError(''); }}>
                      {GEMINI_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem', lineHeight: '1.4' }}>אם מתקבלת שגיאת מכסה (429 / quota), נסה/י מודל אחר — זמינות המכסה החינמית משתנה לפי חשבון ואזור.</p>
                  </div>
                </>
              )}

              {settings.aiProvider === 'groq' && (
                <>
                  <div className="form-group">
                    <label className="form-label" htmlFor="input-groq-key"><span>מפתח API של Groq</span></label>
                    <div className="api-key-input-container">
                      <input
                        id="input-groq-key"
                        type={showApiKey ? 'text' : 'password'}
                        className="form-input numbers-font"
                        placeholder="gsk_..."
                        style={{ paddingLeft: '3rem' }}
                        value={settings.groqApiKey || ''}
                        onChange={(e) => { setLocalSettings({ ...settings, groqApiKey: e.target.value }); setKeyTestStatus('idle'); setKeyTestError(''); }}
                      />
                      <button type="button" className="api-key-toggle-btn" onClick={() => setShowApiKey(!showApiKey)}>
                        {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem', lineHeight: '1.4' }}>🔒 המפתח נשמר רק במכשיר שלך. Groq חינמי לחלוטין עם מכסה נדיבה.</p>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="select-groq-model">מודל Groq</label>
                    <select id="select-groq-model" className="form-select" value={settings.groqModel || DEFAULT_GROQ_MODEL} onChange={(e) => { setLocalSettings({ ...settings, groqModel: e.target.value }); setKeyTestStatus('idle'); setKeyTestError(''); }}>
                      {GROQ_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem', lineHeight: '1.4' }}><strong>gpt-oss-120b</strong> נותן את התוצאות הטובות ביותר בעברית. הדגמים הקטנים חלשים יותר.</p>
                  </div>
                </>
              )}

              {settings.aiProvider === 'openrouter' && (
                <>
                  <div className="form-group">
                    <label className="form-label" htmlFor="input-or-key"><span>מפתח API של OpenRouter</span></label>
                    <div className="api-key-input-container">
                      <input
                        id="input-or-key"
                        type={showApiKey ? 'text' : 'password'}
                        className="form-input numbers-font"
                        placeholder="sk-or-..."
                        style={{ paddingLeft: '3rem' }}
                        value={settings.openRouterApiKey || ''}
                        onChange={(e) => { setLocalSettings({ ...settings, openRouterApiKey: e.target.value }); setKeyTestStatus('idle'); setKeyTestError(''); }}
                      />
                      <button type="button" className="api-key-toggle-btn" onClick={() => setShowApiKey(!showApiKey)}>
                        {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem', lineHeight: '1.4' }}>🔒 המפתח נשמר רק במכשיר שלך. OpenRouter מאפשר שימוש חינמי בדגמי Gemma הפתוחים.</p>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="select-or-model">
                      מודל OpenRouter {orModelsLoading && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(טוען רשימה...)</span>}
                    </label>
                    <select id="select-or-model" className="form-select" value={settings.openRouterModel || DEFAULT_OPENROUTER_MODEL} onChange={(e) => { setLocalSettings({ ...settings, openRouterModel: e.target.value }); setKeyTestStatus('idle'); setKeyTestError(''); }}>
                      {Array.from(new Set([...(orModels.length ? orModels : [...OPENROUTER_MODELS]), ...(settings.openRouterModel ? [settings.openRouterModel] : [])])).map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem', lineHeight: '1.4' }}>
                      {orModelsError
                        ? `לא ניתן לטעון רשימת מודלים (${orModelsError}); מוצגת רשימת ברירת מחדל.`
                        : 'הרשימה נטענת אוטומטית מ-OpenRouter ומכילה רק מודלים חינמיים (:free) הזמינים כעת. gpt-oss / gemma מומלצים לעברית.'}
                    </p>
                  </div>
                </>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '2rem', flexWrap: 'wrap' }}>
                <button type="submit" className="btn btn-primary" id="btn-save-settings" style={{ width: 'auto' }}>
                  שמור הגדרות
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: 'auto' }}
                  onClick={handleTestGeminiKey}
                  disabled={keyTestStatus === 'testing' || !((settings.aiProvider === 'groq' ? settings.groqApiKey : settings.aiProvider === 'openrouter' ? settings.openRouterApiKey : settings.geminiApiKey) || '').trim()}
                >
                  {keyTestStatus === 'testing' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', margin: 0 }}></div>
                      <span>בודק...</span>
                    </div>
                  ) : (
                    <>
                      <CheckCircle size={16} />
                      <span>בדוק/י מפתח</span>
                    </>
                  )}
                </button>
              </div>

              {keyTestStatus === 'valid' && (
                <div style={{ marginTop: '1rem', color: 'var(--success)', fontWeight: 'bold', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <CheckCircle size={16} />
                  <span>המפתח תקין ופעיל! יצירת ברכות AI מוכנה לשימוש.</span>
                </div>
              )}
              {keyTestStatus === 'invalid' && (
                <div style={{ marginTop: '1rem', color: 'var(--danger, #ff5c5c)', fontWeight: 'bold', fontSize: '0.85rem', lineHeight: '1.4' }}>
                  ❌ המפתח אינו תקין. {keyTestError && <span style={{ fontWeight: 400, opacity: 0.85 }}>({keyTestError})</span>}
                </div>
              )}

              {saveStatus === 'success' && (
                <div style={{ marginTop: '1rem', color: 'var(--success)', fontWeight: 'bold', fontSize: '0.9rem', textAlign: 'center' }}>
                  ההגדרות נשמרו בהצלחה!
                </div>
              )}
            </form>

            <div style={{ marginTop: '3rem', padding: '1rem', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', background: 'rgba(255,255,255,0.01)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>איך משיגים מפתח API בחינם?</h3>
              {(settings.aiProvider || 'gemini') === 'gemini' && (
                <ol style={{ paddingRight: '1.25rem', fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <li>כנס לאתר <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" style={{ color: 'var(--secondary)' }}>Google AI Studio</a> והתחבר עם חשבון הגוגל שלך.</li>
                  <li>לחץ על <strong>Create API Key</strong>, העתק את המפתח שנוצר והדבק אותו כאן.</li>
                  <li>אם מתקבלת שגיאת מכסה (429) — נסה/י מודל אחר, או עבור/י ל-Groq / OpenRouter למעלה.</li>
                </ol>
              )}
              {settings.aiProvider === 'groq' && (
                <ol style={{ paddingRight: '1.25rem', fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <li>כנס לאתר <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" style={{ color: 'var(--secondary)' }}>Groq Console</a> והתחבר (חינם, ניתן עם חשבון Google).</li>
                  <li>לחץ על <strong>Create API Key</strong>, העתק את המפתח (מתחיל ב-<span className="numbers-font">gsk_</span>) והדבק אותו כאן.</li>
                  <li>לחץ/י "בדוק/י מפתח" כדי לוודא שהכול עובד. Groq חינמי לחלוטין.</li>
                </ol>
              )}
              {settings.aiProvider === 'openrouter' && (
                <ol style={{ paddingRight: '1.25rem', fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <li>כנס לאתר <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" style={{ color: 'var(--secondary)' }}>OpenRouter</a> והתחבר (חינם, ניתן עם חשבון Google).</li>
                  <li>לחץ על <strong>Create Key</strong>, העתק את המפתח (מתחיל ב-<span className="numbers-font">sk-or-</span>) והדבק אותו כאן.</li>
                  <li>בחר/י מודל <strong>:free</strong> (כמו gemma-3-27b) ולחץ/י "בדוק/י מפתח". לדגמים החינמיים יש מגבלת קצב.</li>
                </ol>
              )}
            </div>
          </section>
        )}
      </main>

      {/* Greeting Modal (Feature 2 & 6: On Demand and Larger Textarea) */}
      {showGreetingModal && (
        <div className="modal-overlay" id="greeting-modal-overlay">
          <div className="modal-content glass-card" id="greeting-modal-content" style={{ maxWidth: '650px' }}>
            <button
              onClick={() => setShowGreetingModal(false)}
              className="icon-btn modal-close-btn"
              title="סגור"
            >
              <X size={20} />
            </button>

            <div className="greeting-modal-header">
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Sparkles size={22} style={{ color: 'var(--primary)' }} />
                <span>
                  {isQuickMode 
                    ? 'מחולל ברכות מהיר (על פי דרישה) ⚡' 
                    : `ניסוח ברכת ${greetingPerson?.occasion} ל-${greetingPerson?.firstName}`}
                </span>
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                {!isQuickMode && greetingPerson && `${greetingPerson.relation} • ${greetingPerson.occasion} (${calculateYears(greetingPerson.eventDate)} שנים)`}
                {isQuickMode && 'יצירת ברכה חכמה בעברית ללא רישום במסד הנתונים'}
              </p>
            </div>

            {/* Quick Mode Input Fields (Feature 2) */}
            {isQuickMode && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem', padding: '1rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--secondary)', marginBottom: '0.25rem' }}>פרטי מקבל הברכה המהירה:</h4>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>שם פרטי</label>
                    <input
                      type="text"
                      className="form-input"
                      style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                      placeholder="ישראל"
                      value={quickFirstName}
                      onChange={(e) => setQuickFirstName(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>שם משפחה (אופציונלי)</label>
                    <input
                      type="text"
                      className="form-input"
                      style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                      placeholder="ישראלי"
                      value={quickLastName}
                      onChange={(e) => setQuickLastName(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 0.8fr', gap: '0.75rem', alignItems: 'end' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>סוג האירוע</label>
                    <select
                      className="form-select"
                      style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                      value={quickOccasion}
                      onChange={(e) => setQuickOccasion(e.target.value as any)}
                    >
                      {OCCASIONS.map(o => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>קשר משפחתי/חברתי</label>
                    <select
                      className="form-select"
                      style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                      value={quickRelation}
                      onChange={(e) => handleQuickRelationChange(e.target.value)}
                    >
                      {RELATIONS.map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>גיל/שנים</label>
                    <input
                      type="number"
                      className="form-input numbers-font"
                      style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                      min={1}
                      max={120}
                      value={quickYears}
                      onChange={(e) => setQuickYears(Number(e.target.value))}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
                  <div className="gender-radio-group" style={{ gap: '1rem' }}>
                    <label className="gender-radio-label" style={{ fontSize: '0.8rem' }}>
                      <input
                        type="radio"
                        name="quickGender"
                        className="gender-radio-input"
                        checked={quickGender === 'Male'}
                        onChange={() => setQuickGender('Male')}
                      />
                      <span>זכר</span>
                    </label>
                    <label className="gender-radio-label" style={{ fontSize: '0.8rem' }}>
                      <input
                        type="radio"
                        name="quickGender"
                        className="gender-radio-input"
                        checked={quickGender === 'Female'}
                        onChange={() => setQuickGender('Female')}
                      />
                      <span>נקבה</span>
                    </label>
                    <label className="gender-radio-label" style={{ fontSize: '0.8rem' }}>
                      <input
                        type="radio"
                        name="quickGender"
                        className="gender-radio-input"
                        checked={quickGender === 'Couple'}
                        onChange={() => setQuickGender('Couple')}
                      />
                      <span>זוג / רבים</span>
                    </label>
                  </div>

                  <label className="gender-radio-label" style={{ fontSize: '0.8rem' }}>
                    <input
                      type="checkbox"
                      checked={quickUseFirstNameOnly}
                      onChange={(e) => setQuickUseFirstNameOnly(e.target.checked)}
                      style={{ width: '15px', height: '15px', accentColor: 'var(--primary)' }}
                    />
                    <span>שם פרטי בלבד בברכה</span>
                  </label>
                </div>

                <button
                  type="button"
                  onClick={handleGenerateOnDemand}
                  className="btn btn-primary"
                  style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', marginTop: '0.25rem' }}
                  disabled={isGenerating}
                >
                  <Sparkles size={14} />
                  <span>ייצר ברכה מהירה באמצעות AI ✨</span>
                </button>
              </div>
            )}

            {/* Preview Box */}
            <div className={`greeting-preview-box ${isGenerating ? 'loading' : ''}`} id="greeting-preview-box" style={{ minHeight: isQuickMode ? '140px' : '180px' }}>
              {isGenerating ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div className="spinner"></div>
                  <span>מנסח ברכה בעברית...</span>
                </div>
              ) : (
                <textarea
                  className="greeting-edit-textarea"
                  value={greetingText}
                  onChange={(e) => setGreetingText(e.target.value)}
                  placeholder='הברכה תופיע כאן וניתנת לעריכה ידנית לפני העתקה / שליחה. מלא/י את הפרטים ולחץ/י על "ייצר ברכה".'
                  dir="rtl"
                />
              )}
            </div>

            {greetingError && !isGenerating && (
              <div style={{ marginBottom: '1.25rem', padding: '0.6rem 0.85rem', borderRadius: '8px', background: 'rgba(255,92,92,0.08)', border: '1px solid rgba(255,92,92,0.35)', color: '#ff9b9b', fontSize: '0.78rem', lineHeight: '1.45', direction: 'rtl' }}>
                ⚠️ {greetingError}
              </div>
            )}

            {/* Control Panel */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1.25rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem' }}>התאמת הברכה מחדש:</h3>
              
              <div className="greeting-options-grid">
                <div className="form-group">
                  <label className="form-label">סגנון / טון הברכה</label>
                  <div className="tone-selector-buttons">
                    <button
                      className={`tone-btn ${greetingTone === 'normal' ? 'active' : ''}`}
                      onClick={() => {
                        setGreetingTone('normal');
                        handleRegenerateGreeting('normal', customGreetingDetails);
                      }}
                    >
                      חם / רגיל
                    </button>
                    <button
                      className={`tone-btn ${greetingTone === 'funny' ? 'active' : ''}`}
                      onClick={() => {
                        setGreetingTone('funny');
                        handleRegenerateGreeting('funny', customGreetingDetails);
                      }}
                    >
                      מצחיק
                    </button>
                    <button
                      className={`tone-btn ${greetingTone === 'emotional' ? 'active' : ''}`}
                      onClick={() => {
                        setGreetingTone('emotional');
                        handleRegenerateGreeting('emotional', customGreetingDetails);
                      }}
                    >
                      מרגש
                    </button>
                    <button
                      className={`tone-btn ${greetingTone === 'short' ? 'active' : ''}`}
                      onClick={() => {
                        setGreetingTone('short');
                        handleRegenerateGreeting('short', customGreetingDetails);
                      }}
                    >
                      קצר
                    </button>
                  </div>
                </div>

                {/* Feature 6: Larger text window for custom request (Textarea) */}
                <div className="form-group">
                  <label className="form-label" htmlFor="custom-instruction">הנחיה מיוחדת ל-AI (למשל: "תאחל לו טיול מוצלח")</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <textarea
                      id="custom-instruction"
                      rows={3}
                      className="form-textarea"
                      style={{ fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}
                      placeholder="הוסף בקשה מיוחדת, פרטים ספציפיים שחשוב לכלול או איחולים ייחודיים..."
                      value={customGreetingDetails}
                      onChange={(e) => setCustomGreetingDetails(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ width: '100%', padding: '0.5rem 1rem' }}
                      onClick={() => handleRegenerateGreeting(greetingTone, customGreetingDetails)}
                      disabled={!greetingText && isQuickMode}
                    >
                      עדכן ונסח מחדש באמצעות AI 🪄
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={handleCopyGreeting}
                disabled={isGenerating || !greetingText}
                id="btn-copy-greeting"
              >
                <Copy size={16} />
                <span>{copyFeedback ? 'הועתק! 🗸' : 'העתק ברכה'}</span>
              </button>

              <button
                type="button"
                className="btn btn-primary btn-success"
                style={{ flex: 1 }}
                onClick={handleWhatsAppSend}
                disabled={isGenerating || !greetingText}
                id="btn-send-whatsapp"
              >
                <Sparkles size={16} />
                <span>שלח בוואטסאפ</span>
              </button>
            </div>

            {!isQuickMode && greetingPerson && !greetingPerson.phone && (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '0.75rem' }}>
                טיפ: הוסף מספר טלפון לאיש הקשר כדי לפתוח את שיחת הוואטסאפ איתו ישירות.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Google Contacts Picker Modal (People API) */}
      {showContactsModal && (
        <div className="modal-overlay" style={{ zIndex: 5000 }}>
          <div className="modal-content glass-card" style={{ maxWidth: '420px' }}>
            <button
              onClick={() => setShowContactsModal(false)}
              className="icon-btn modal-close-btn"
              title="סגור"
            >
              <X size={20} />
            </button>

            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--secondary)' }}>
              <Users size={20} />
              <span>ייבוא מאנשי הקשר של Google 📱</span>
            </h3>

            {contactsError === 'not-connected' ? (
              <div style={{ textAlign: 'center', padding: '1.5rem 1rem' }}>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: '1.5' }}>
                  כדי לייבא אנשי קשר אמיתיים, התחבר/י לחשבון Google שלך.
                </p>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: 'auto', background: '#4285F4' }}
                  onClick={() => handleGoogleLoginFor('contacts')}
                  disabled={isLoggingIn}
                >
                  <LogIn size={16} />
                  <span>{isLoggingIn ? 'מתחבר...' : 'התחבר/י עם Google'}</span>
                </button>
              </div>
            ) : contactsLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem', gap: '0.75rem' }}>
                <div className="spinner"></div>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>טוען אנשי קשר מ-Google...</span>
              </div>
            ) : contactsError ? (
              <div style={{ textAlign: 'center', padding: '1.5rem 1rem' }}>
                <p style={{ fontSize: '0.9rem', color: 'var(--danger, #ff5c5c)', marginBottom: '1rem', lineHeight: '1.5' }}>{contactsError}</p>
                <button type="button" className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => openContactsModal(contactsTarget)}>נסה/י שוב</button>
              </div>
            ) : googleContacts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                לא נמצאו אנשי קשר בחשבון Google שלך.
              </div>
            ) : (() => {
              const q = contactsSearch.toLowerCase().trim();
              const filtered = q
                ? googleContacts.filter(c =>
                    `${c.firstName} ${c.lastName || ''}`.toLowerCase().includes(q) ||
                    (c.phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, '')) && q.replace(/\D/g, '') !== ''
                  )
                : googleContacts;
              return (
              <>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', lineHeight: '1.4' }}>
                  בחר/י איש קשר כדי למלא אוטומטית את פרטי האירוע. אם קיים תאריך יום הולדת ב-Google, הוא ימולא גם כן.
                </p>
                <div className="search-container" style={{ marginBottom: '0.85rem' }}>
                  <input
                    type="text"
                    className="form-input search-input"
                    placeholder="חיפוש לפי שם או טלפון..."
                    value={contactsSearch}
                    onChange={(e) => setContactsSearch(e.target.value)}
                    autoFocus
                  />
                  <Search className="search-icon" size={18} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '300px', overflowY: 'auto', paddingLeft: '5px' }}>
                  {filtered.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      אין תוצאות עבור "{contactsSearch}"
                    </div>
                  ) : filtered.map((c) => (
                    <div
                      key={c.resourceName}
                      onClick={() => handleSelectGoogleContact(c)}
                      className="glass-card"
                      style={{
                        padding: '0.75rem 1rem',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        border: '1px solid var(--panel-border)',
                        transition: 'var(--transition-smooth)'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--secondary)'}
                      onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--panel-border)'}
                    >
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{c.firstName} {c.lastName || ''}</div>
                        {c.phone && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }} className="phone-number" dir="ltr">{c.phone}</div>}
                        {c.birthday && <div style={{ fontSize: '0.75rem', color: 'var(--primary)' }}>🎂 {c.birthday.split('-').reverse().join('/')}</div>}
                      </div>
                      {c.gender && (
                        <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.4rem', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}>
                          {getGenderLabel(c.gender)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </>
              );
            })()}
          </div>
        </div>
      )}

    </div>
  );
}
