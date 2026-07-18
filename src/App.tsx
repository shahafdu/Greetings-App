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
  Share2,
  CheckCircle,
  ArrowUp,
  ArrowDown,
  Save,
  Bookmark
} from 'lucide-react';

import type { Person, AppSettings, GreetingDraft, QuickDraft } from './services/storage';
import {
  getPeople,
  addPerson,
  updatePerson,
  deletePerson,
  getSettings,
  saveSettings,
  addPersonDraft,
  deletePersonDraft,
  getQuickDrafts,
  addQuickDraft,
  deleteQuickDraft,
  mergeQuickDrafts,
  initStorage,
  unlockStorage,
  enableLock,
  disableLock,
  isLockEnabled,
  calculateYears,
  getCelebrationYears,
  getYearsForOccurrence,
  getDaysToEvent,
  isEventToday,
  getDateMode,
  getOccurrenceDateKind,
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

import { generateHebrewBirthdayGreeting, testAiApiKey, fetchOpenRouterFreeModels, AI_PROXY_URL } from './services/gemini';
import { MAX_CUSTOM_INSTRUCTION_LEN } from './services/aiGuard';
import { gregToHebrew, formatHebrewDate, HEBREW_MONTHS as JEWISH_MONTHS, hebrewAnniversaryInGregYear, hebrewDayLabel, hebrewMonthYearLabel, dayGematriya } from './services/hebrewDate';
import { checkForUpdate, type UpdateInfo } from './services/updateCheck';
import { generateShareCode, encryptEvents, decryptEvents, pickBackupSettings, type PortableEvent } from './services/share';
import { t, setLang } from './i18n';
import { scheduleEventNotifications } from './services/notifications';
import {
  fetchGoogleContacts,
  fetchGoogleCalendarEvents,
  GoogleApiError
} from './services/google';
import type { GoogleContact, GoogleCalendarEvent } from './services/google';
import { fetchDeviceContacts, fetchDeviceCalendarEvents } from './services/nativeDevice';
import { isBiometricEnabled, isBiometricSupported, enableBiometric, disableBiometric, biometricGetPassphrase } from './services/biometric';

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

// Short label noting whether an occurrence falls on the Hebrew or Gregorian date. Shown only
// when the user enabled "show Hebrew dates" (so the app supports both calendars). Returns '' for
// events with no Hebrew/Gregorian distinction to surface.
const dateKindLabel = (kind: 'hebrew' | 'gregorian' | 'both' | null): string => {
  if (kind === 'hebrew') return `🕎 ${t('לפי התאריך העברי')}`;
  if (kind === 'gregorian') return `📅 ${t('לפי התאריך הלועזי')}`;
  if (kind === 'both') return `🕎📅 ${t('התאריך העברי והלועזי')}`;
  return '';
};

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
  // Keep the i18n language in sync during render so t() is correct this pass.
  setLang(settings.language || 'he');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success'>('idle');

  // Form State
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [showEventForm, setShowEventForm] = useState(false); // the add/edit form is a modal
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
  // Hebrew date (auto-computed from the Gregorian date, editable, opt-in for recurrence)
  const [formHebrewDay, setFormHebrewDay] = useState<number | undefined>(undefined);
  const [formHebrewMonth, setFormHebrewMonth] = useState<number | undefined>(undefined);
  const [formDateMode, setFormDateMode] = useState<'gregorian' | 'hebrew' | 'both'>('gregorian');
  const [formHebrewEdited, setFormHebrewEdited] = useState(false); // user manually overrode it
  const [formHebrewAfterSunset, setFormHebrewAfterSunset] = useState(false);
  const [showHebrewEdit, setShowHebrewEdit] = useState(false);
  // In-app update prompt (GitHub Releases)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  // Share / import events
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareSelectedIds, setShareSelectedIds] = useState<Set<string>>(new Set());
  const [shareCode, setShareCode] = useState('');
  const [shareBlob, setShareBlob] = useState('');
  const [shareIncludeSettings, setShareIncludeSettings] = useState(false);
  const [shareIncludeDrafts, setShareIncludeDrafts] = useState(false); // off by default (drafts are personal)
  const [showImportModal, setShowImportModal] = useState(false);
  const [importBlob, setImportBlob] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const [importCode, setImportCode] = useState('');
  const [importPreview, setImportPreview] = useState<PortableEvent[] | null>(null);
  const [importSettings, setImportSettings] = useState<Partial<AppSettings> | null>(null);
  const [importRestoreSettings, setImportRestoreSettings] = useState(true);
  const [importQuickDrafts, setImportQuickDrafts] = useState<QuickDraft[] | null>(null);
  const [importHasDrafts, setImportHasDrafts] = useState(false); // bundle carries drafts (event or quick)
  const [importRestoreDrafts, setImportRestoreDrafts] = useState(true);
  const [importError, setImportError] = useState('');
  const [importDone, setImportDone] = useState(0);

  // Calendar Navigation State
  const todayDate = new Date();
  const [calendarMonth, setCalendarMonth] = useState(todayDate.getMonth());
  const [calendarYear, setCalendarYear] = useState(todayDate.getFullYear());

  // Greeting Modal State
  const [showGreetingModal, setShowGreetingModal] = useState(false);
  const [greetingPerson, setGreetingPerson] = useState<Person | null>(null);
  const [greetingText, setGreetingText] = useState('');
  const [greetingTone, setGreetingTone] = useState<'normal' | 'funny' | 'emotional' | 'short'>('normal');
  const [greetingLang, setGreetingLang] = useState<'he' | 'en'>('he');
  const [customGreetingDetails, setCustomGreetingDetails] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [greetingError, setGreetingError] = useState('');
  const [copyFeedback, setCopyFeedback] = useState(false);
  // Drafts (Features 1, 2, 4). Event drafts belong to the open greetingPerson; quick drafts are
  // a standalone list. draftFeedback flashes a brief "saved" confirmation after a save.
  const [personDrafts, setPersonDrafts] = useState<GreetingDraft[]>([]);
  const [quickDrafts, setQuickDrafts] = useState<QuickDraft[]>([]);
  const [draftFeedback, setDraftFeedback] = useState('');

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
  // Biometric unlock (Android fingerprint/face)
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [useBiometricChecked, setUseBiometricChecked] = useState(false);

  // Calendar Sync state (real Google Calendar via Calendar API; shown on the calendar grid)
  const [googleEvents, setGoogleEvents] = useState<GoogleCalendarEvent[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState('');
  // The day tapped on the calendar grid — shows a detail panel with that day's full event list.
  const [selectedDay, setSelectedDay] = useState<{ year: number; month: number; day: number } | null>(null);
  // When importing a synced event via the form, remember which event so it's marked imported on save.
  const [pendingImportEventId, setPendingImportEventId] = useState<string | null>(null);

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
    setQuickDrafts(getQuickDrafts());
    setLocalSettings(getSettings());

    // Restore a saved OAuth access token so the Google connection persists across
    // restarts (the token is short-lived ~1h; on expiry we prompt an inline re-login).
    const savedToken = localStorage.getItem('birthday_greetings_google_token');
    if (savedToken) setGoogleAccessToken(savedToken);
  }, []);

  // Keep OS notifications in sync with the events (native/Android only; no-op on web).
  // Reschedules on every add/edit/delete and on app start.
  useEffect(() => {
    scheduleEventNotifications(people);
  }, [people]);

  // Android hardware/gesture back button: step back WITHIN the app (close an open modal, the
  // day panel, or return to the events tab) instead of exiting. Only exits from the events tab
  // with nothing open. Re-subscribes when the relevant state changes so it always acts on it.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let remove: (() => void) | undefined;
    (async () => {
      const { App } = await import('@capacitor/app');
      const handle = await App.addListener('backButton', () => {
        // Close inner/overlay modals first (they open ON TOP of the event form), so back
        // returns to the form rather than closing it and leaving the modal stuck.
        if (showContactsModal) { setShowContactsModal(false); return; }
        if (showGreetingModal) { setShowGreetingModal(false); return; }
        if (showShareModal) { setShowShareModal(false); return; }
        if (showImportModal) { setShowImportModal(false); return; }
        if (showEventForm) { handleCloseEventForm(); return; }
        if (selectedDay) { setSelectedDay(null); return; }
        if (activeTab !== 'list') { setActiveTab('list'); return; }
        App.exitApp();
      });
      remove = () => { handle.remove(); };
    })();
    return () => { if (remove) remove(); };
  }, [showEventForm, showContactsModal, showGreetingModal, showShareModal, showImportModal, selectedDay, activeTab]);

  // Check GitHub Releases for a newer build on every launch (no-ops while the repo is private).
  useEffect(() => {
    checkForUpdate().then(info => { if (info?.available) setUpdateInfo(info); });
  }, []);

  // Apply UI language + document direction (RTL for Hebrew, LTR for English).
  useEffect(() => {
    const lang = settings.language || 'he';
    setLang(lang);
    const dir = lang === 'en' ? 'ltr' : 'rtl';
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('dir', dir);
    document.body.style.direction = dir;
    setGreetingLang(lang); // greeting default follows the app language on every language change
  }, [settings.language]);

  // Auto-save settings on any change (skip the initial mount) — no manual "save" needed.
  const didMountSettings = useRef(false);
  useEffect(() => {
    if (!didMountSettings.current) { didMountSettings.current = true; return; }
    saveSettings(settings);
  }, [settings]);

  // Auto-compute the Hebrew date from the Gregorian date + sunset flag (unless manually overridden).
  useEffect(() => {
    if (formHebrewEdited) return;
    const h = gregToHebrew(formDate, formHebrewAfterSunset);
    setFormHebrewDay(h?.day);
    setFormHebrewMonth(h?.month);
  }, [formDate, formHebrewEdited, formHebrewAfterSunset]);

  // Detect biometric availability, and auto-prompt fingerprint on the lock screen if enabled.
  useEffect(() => {
    isBiometricSupported().then(setBiometricSupported);
    if (lockState === 'locked' && isBiometricEnabled()) {
      handleBiometricUnlock();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // If a Google fetch failed because the token expired, drop it so the UI can prompt reconnect.
  const handleGoogleFetchError = (err: unknown) => {
    if (err instanceof GoogleApiError && err.status === 401) {
      setGoogleAccessToken(null);
      localStorage.removeItem('birthday_greetings_google_token');
    }
  };

  // Fetch contacts once and cache them (used both by the picker and for auto-matching
  // a phone number to a calendar event). Returns the freshly fetched list.
  // Fetch contacts from EVERY available source — the device (on a phone) and Google (when
  // connected) — merged and de-duped. Returns an error string only if nothing loaded at all.
  const fetchAllContacts = async (): Promise<{ contacts: GoogleContact[]; error?: string }> => {
    const all: GoogleContact[] = [];
    const errors: string[] = [];
    if (Capacitor.isNativePlatform()) {
      try { all.push(...await fetchDeviceContacts()); } catch (e) { errors.push(e instanceof Error ? e.message : 'מכשיר'); }
    }
    if (googleAccessToken) {
      try { all.push(...await fetchGoogleContacts(googleAccessToken)); } catch (e) { handleGoogleFetchError(e); errors.push('Google'); }
    }
    const seen = new Set<string>();
    const merged = all
      .filter(c => {
        const key = `${c.firstName}|${c.lastName || ''}|${(c.phone || '').replace(/\D/g, '')}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.firstName.localeCompare(b.firstName, 'he'));
    return { contacts: merged, error: merged.length === 0 && errors.length ? errors.join(' | ') : undefined };
  };

  // Same for calendar events (device + Google), merged and de-duped by title+date.
  const fetchAllCalendarEvents = async (): Promise<{ events: GoogleCalendarEvent[]; error?: string }> => {
    const all: GoogleCalendarEvent[] = [];
    const errors: string[] = [];
    if (Capacitor.isNativePlatform()) {
      try { all.push(...await fetchDeviceCalendarEvents()); } catch (e) { errors.push(e instanceof Error ? e.message : 'מכשיר'); }
    }
    if (googleAccessToken) {
      try { all.push(...await fetchGoogleCalendarEvents(googleAccessToken)); } catch (e) { handleGoogleFetchError(e); errors.push('Google'); }
    }
    const seen = new Set<string>();
    const merged = all.filter(e => {
      const k = `${e.title}|${e.date}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return { events: merged, error: merged.length === 0 && errors.length ? errors.join(' | ') : undefined };
  };

  const ensureContactsLoaded = async (): Promise<GoogleContact[]> => {
    if (googleContacts.length > 0) return googleContacts;
    const { contacts } = await fetchAllContacts();
    setGoogleContacts(contacts);
    return contacts;
  };

  const openContactsModal = async (target: 'form' | 'quick' = 'form') => {
    setContactsTarget(target);
    setShowContactsModal(true);
    setContactsError('');
    setContactsSearch('');
    // On the web with no Google connection there's nothing to read; on a phone the device is
    // always available (and Google is added to the merge once connected).
    if (!Capacitor.isNativePlatform() && !googleAccessToken) {
      setContactsError('not-connected');
      return;
    }
    setContactsLoading(true);
    try {
      const { contacts, error } = await fetchAllContacts();
      setGoogleContacts(contacts);
      if (error) setContactsError(error);
    } finally {
      setContactsLoading(false);
    }
  };

  // Load calendar events from all sources onto the calendar grid.
  const syncGoogleCalendar = async () => {
    setCalendarError('');
    if (!Capacitor.isNativePlatform() && !googleAccessToken) {
      setCalendarError('not-connected');
      return;
    }
    setCalendarLoading(true);
    try {
      const [{ events, error }] = await Promise.all([
        fetchAllCalendarEvents(),
        ensureContactsLoaded().catch(() => [])
      ]);
      setGoogleEvents(events);
      if (error) setCalendarError(error);
    } finally {
      setCalendarLoading(false);
    }
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
      setQuickDrafts(getQuickDrafts());
      setLocalSettings(getSettings());
    } else {
      setUnlockError('סיסמה שגויה. נסה/י שוב.');
    }
  };

  // Unlock via fingerprint: retrieve the stored passphrase from the Keystore, then unlock.
  const handleBiometricUnlock = async () => {
    setUnlockError('');
    const pass = await biometricGetPassphrase();
    if (!pass) {
      setUnlockError('האימות הביומטרי בוטל או נכשל — ניתן להזין סיסמה.');
      return;
    }
    const ok = await unlockStorage(pass);
    if (ok) {
      setLockState('unlocked');
      refreshPeopleList();
      setQuickDrafts(getQuickDrafts());
      setLocalSettings(getSettings());
    } else {
      setUnlockError('האימות הצליח אך פתיחת הנתונים נכשלה.');
    }
  };

  // Enable the App Lock: encrypt current data behind a new passphrase (+ optional biometric).
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
    if (useBiometricChecked && biometricSupported) {
      try {
        await enableBiometric(newPassphrase);
      } catch (err) {
        console.error('Failed to enable biometric:', err);
      }
    }
    setLockEnabled(true);
    setNewPassphrase('');
    setConfirmPassphrase('');
    setUseBiometricChecked(false);
  };

  // Disable the App Lock: store data as plaintext again and clear biometric.
  const handleDisableLock = async () => {
    if (!window.confirm('לבטל את נעילת האפליקציה? הנתונים יישמרו ללא הצפנה במכשיר.')) return;
    disableLock();
    await disableBiometric();
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
    setFormHebrewDay(undefined);
    setFormHebrewMonth(undefined);
    setFormHebrewAfterSunset(false);
    setFormDateMode('gregorian');
    setFormHebrewEdited(false);
    setShowHebrewEdit(false);
  };

  // Open the (modal) form blank for a new event.
  const handleNewEvent = () => {
    resetForm();
    setShowEventForm(true);
  };

  // Close the event form modal and clear it.
  const handleCloseEventForm = () => {
    resetForm();
    setPendingImportEventId(null);
    setShowEventForm(false);
  };

  // ---- Share / import events ----
  const openShareModal = () => {
    setShareSelectedIds(new Set(people.map(p => p.id))); // default: all selected
    setShareCode('');
    setShareBlob('');
    setShareIncludeSettings(false); // off by default so sharing to others never leaks keys
    setShareIncludeDrafts(false);   // off by default — drafts are personal
    setShowShareModal(true);
  };

  const toggleShareId = (id: string) => {
    setShareSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const handleGenerateShare = async () => {
    const selected = people.filter(p => shareSelectedIds.has(p.id));
    if (selected.length === 0) return;
    const code = generateShareCode();
    setShareBlob(await encryptEvents(
      selected,
      code,
      shareIncludeSettings ? pickBackupSettings(settings) : undefined,
      { includeDrafts: shareIncludeDrafts, quickDrafts: shareIncludeDrafts ? quickDrafts : [] }
    ));
    setShareCode(code);
  };

  const handleSendShareFile = async () => {
    // .txt so WhatsApp (and everything else) accepts it as a document.
    const fileName = `greetings-events-${new Date().toISOString().slice(0, 10)}.txt`;
    if (Capacitor.isNativePlatform()) {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');
      const res = await Filesystem.writeFile({ path: fileName, data: shareBlob, directory: Directory.Cache, encoding: Encoding.UTF8 });
      // Share the FILE (not text) so the recipient gets an attachment to import.
      await Share.share({ title: 'אירועים לשיתוף', files: [res.uri], dialogTitle: 'שיתוף אירועים' });
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([shareBlob], { type: 'text/plain' }));
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  };

  const openImportModal = () => {
    setImportBlob('');
    setImportFileName('');
    setImportCode('');
    setImportPreview(null);
    setImportSettings(null);
    setImportRestoreSettings(true);
    setImportQuickDrafts(null);
    setImportHasDrafts(false);
    setImportRestoreDrafts(true);
    setImportError('');
    setImportDone(0);
    setShowImportModal(true);
  };

  const handleImportFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    setImportBlob((await file.text()).trim());
    setImportPreview(null);
    setImportSettings(null);
    setImportQuickDrafts(null);
    setImportHasDrafts(false);
    setImportError('');
  };

  const handleDecryptImport = async () => {
    setImportError('');
    try {
      const bundle = await decryptEvents(importBlob, importCode);
      setImportPreview(bundle.events);
      setImportSettings(bundle.settings || null);
      setImportRestoreSettings(!!bundle.settings);
      const quickDraftsIn = bundle.quickDrafts || [];
      const eventDraftsCount = bundle.events.reduce((n, e) => n + ((e as Person).drafts?.length || 0), 0);
      setImportQuickDrafts(quickDraftsIn);
      const hasDrafts = quickDraftsIn.length > 0 || eventDraftsCount > 0;
      setImportHasDrafts(hasDrafts);
      setImportRestoreDrafts(hasDrafts);
    } catch (err) {
      setImportPreview(null);
      setImportSettings(null);
      setImportQuickDrafts(null);
      setImportHasDrafts(false);
      setImportError(err instanceof Error ? err.message : 'שגיאה בפענוח.');
    }
  };

  const handleConfirmImport = () => {
    if (!importPreview) return;
    const key = (e: { firstName: string; lastName?: string; eventDate: string; occasion: string }) =>
      `${e.firstName}|${e.lastName || ''}|${e.eventDate}|${e.occasion}`;
    const existing = new Set(people.map(key));
    let added = 0;
    importPreview.forEach(ev => {
      if (existing.has(key(ev))) return;
      // Drafts are personal — strip them from incoming events unless the user opted to restore.
      const { drafts, ...rest } = ev as PortableEvent & { drafts?: GreetingDraft[] };
      addPerson(importRestoreDrafts ? { ...rest, drafts } : rest);
      existing.add(key(ev));
      added++;
    });
    // Full backup: optionally restore settings/keys (keeping this device's Google session).
    if (importSettings && importRestoreSettings) {
      const merged = { ...settings, ...importSettings } as AppSettings;
      setLocalSettings(merged);
      saveSettings(merged);
    }
    // Merge any imported quick-generator drafts (de-duplicated by text) when opted in.
    if (importRestoreDrafts && importQuickDrafts && importQuickDrafts.length) {
      mergeQuickDrafts(importQuickDrafts);
      setQuickDrafts(getQuickDrafts());
    }
    refreshPeopleList();
    setImportDone(added);
    setImportPreview(null);
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
      celebrantRelationToProxy: formViaProxy && formCelebrantLink.trim() ? formCelebrantLink.trim() : undefined,
      // Link to the synced event this was imported from (new import), or keep the existing link on edit.
      sourceEventId: pendingImportEventId || editingPerson?.sourceEventId || undefined,
      hebrewDay: formHebrewDay,
      hebrewMonth: formHebrewMonth,
      hebrewAfterSunset: formHebrewAfterSunset,
      dateMode: formDateMode,
      useHebrewDate: undefined
    };

    if (editingPerson) {
      updatePerson({ ...personData, id: editingPerson.id });
    } else {
      addPerson(personData);
    }

    setPendingImportEventId(null);
    resetForm();
    setShowEventForm(false);
    refreshPeopleList();
  };

  // Delete Person
  const handleDeletePerson = (id: string, name: string) => {
    if (window.confirm(`${t('למחוק את האירוע של')} ${name}?`)) {
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
    setFormHebrewDay(person.hebrewDay);
    setFormHebrewMonth(person.hebrewMonth);
    setFormHebrewAfterSunset(!!person.hebrewAfterSunset);
    setFormDateMode(getDateMode(person));
    // Treat as manually edited only if the stored Hebrew date differs from the auto value.
    const auto = gregToHebrew(person.eventDate, !!person.hebrewAfterSunset);
    setFormHebrewEdited(!!person.hebrewDay && (!auto || person.hebrewDay !== auto.day || person.hebrewMonth !== auto.month));
    setShowHebrewEdit(false);
    setShowEventForm(true);
  };

  // Generate Greeting Action (Stored Person)
  const handleOpenGreeting = async (person: Person) => {
    const lang = settings.language || 'he';
    setIsQuickMode(false);
    setGreetingPerson(person);
    setPersonDrafts(person.drafts || []);
    setDraftFeedback('');
    setGreetingTone('normal'); setGreetingLang(lang);
    setCustomGreetingDetails('');
    setGreetingText('');
    setGreetingError('');
    setShowGreetingModal(true);
    setIsGenerating(true);

    try {
      // Feed any saved drafts to the AI as style examples (Feature 3).
      const examples = (person.drafts || []).map(d => d.text);
      const { text, error } = await generateHebrewBirthdayGreeting(person, 'normal', '', settings, lang, examples);
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
        settings,
        greetingLang
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
    person = greetingPerson,
    langOverride?: 'he' | 'en'
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
      // For a stored event, reuse its saved drafts as style examples (Feature 3).
      const examples = !isQuickMode && greetingPerson ? (greetingPerson.drafts || []).map(d => d.text) : [];
      const { text, error } = await generateHebrewBirthdayGreeting(person, tone, customText, settings, langOverride ?? greetingLang, examples);
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

  // Brief "saved" confirmation shown next to a save-draft button.
  const flashDraftSaved = () => {
    setDraftFeedback('saved');
    setTimeout(() => setDraftFeedback(''), 2000);
  };

  // ---- Drafts: event-attached (Features 1, 4) ----

  // Save the current greeting as a draft on the open event.
  const handleSaveEventDraft = () => {
    if (!greetingPerson || !greetingText.trim()) return;
    const updated = addPersonDraft(greetingPerson.id, {
      text: greetingText.trim(),
      tone: greetingTone,
      lang: greetingLang
    });
    if (updated) {
      setGreetingPerson(updated);
      setPersonDrafts(updated.drafts || []);
      refreshPeopleList();
      flashDraftSaved();
    }
  };

  const handleLoadEventDraft = (draft: GreetingDraft) => {
    setGreetingText(draft.text);
    if (draft.tone) setGreetingTone(draft.tone);
    if (draft.lang) setGreetingLang(draft.lang);
    setGreetingError('');
  };

  const handleDeleteEventDraft = (draftId: string) => {
    if (!greetingPerson) return;
    const updated = deletePersonDraft(greetingPerson.id, draftId);
    if (updated) {
      setGreetingPerson(updated);
      setPersonDrafts(updated.drafts || []);
      refreshPeopleList();
    }
  };

  // ---- Drafts: quick generator standalone list (Features 2, 4) ----

  const handleSaveQuickDraft = () => {
    if (!greetingText.trim()) return;
    addQuickDraft({
      text: greetingText.trim(),
      tone: greetingTone,
      lang: greetingLang,
      firstName: quickFirstName.trim() || 'ללא שם',
      lastName: quickLastName.trim() || undefined,
      occasion: quickOccasion,
      relation: quickRelation,
      gender: quickGender,
      years: quickYears,
      useFirstNameOnly: quickUseFirstNameOnly,
      viaProxy: quickViaProxy,
      proxyName: quickViaProxy && quickProxyName.trim() ? quickProxyName.trim() : undefined,
      proxyGender: quickViaProxy ? quickProxyGender : undefined,
      celebrantLink: quickViaProxy && quickCelebrantLink.trim() ? quickCelebrantLink.trim() : undefined
    });
    setQuickDrafts(getQuickDrafts());
    flashDraftSaved();
  };

  // Load a quick draft back into the generator form (does NOT auto-generate — Feature 2).
  const handleLoadQuickDraft = (draft: QuickDraft) => {
    setQuickFirstName(draft.firstName || '');
    setQuickLastName(draft.lastName || '');
    setQuickOccasion(draft.occasion as Person['occasion']);
    setQuickRelation(draft.relation || 'חבר/ה');
    setQuickGender(draft.gender || 'Male');
    setQuickYears(draft.years || 25);
    setQuickUseFirstNameOnly(draft.useFirstNameOnly ?? true);
    setQuickViaProxy(!!draft.viaProxy);
    setQuickProxyName(draft.proxyName || '');
    setQuickProxyGender(draft.proxyGender || 'Male');
    setQuickCelebrantLink(draft.celebrantLink || '');
    setGreetingText(draft.text);
    if (draft.tone) setGreetingTone(draft.tone);
    if (draft.lang) setGreetingLang(draft.lang);
    setGreetingError('');
  };

  const handleDeleteQuickDraft = (id: string) => {
    deleteQuickDraft(id);
    setQuickDrafts(getQuickDrafts());
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
  // Import a synced calendar event by opening the add-event form PRE-FILLED, so the user can
  // review/adjust (relation, gender, recurrence — which device/Google events don't carry) before
  // saving. On save it's marked imported (handleSubmitPerson uses pendingImportEventId).
  const handleReviewImportEvent = (event: GoogleCalendarEvent) => {
    const occasion = guessOccasion(event.title);
    const recurring = ['יום הולדת', 'יום נישואין', 'חג שמח'].includes(occasion);
    const match = matchContactForEvent(event.title);
    resetForm();
    setFormFirstName(event.title);
    setFormDate(event.date);
    setFormOccasion(occasion);
    setFormRelation('חבר/ה');
    if (match?.gender) setFormGender(match.gender);
    if (match?.phone) setFormPhone(match.phone);
    setFormIsRecurring(recurring);
    setFormRecurrence(recurring ? 'yearly' : 'once');
    setPendingImportEventId(event.id);
    setSelectedDay(null); // close the day window; the form modal takes over
    setShowEventForm(true);
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

  // Source-event ids that are already saved as app events — used to hide their dashed chip.
  // Derived from people, so DELETING an event automatically brings its dashed chip back.
  const importedSourceIds = new Set(
    people.map(p => p.sourceEventId).filter((x): x is string => !!x)
  );

  // Saved events + pending (synced, not-yet-added) events that fall on a given day.
  // Does a person's event fall on a given calendar day? Hebrew-date events land on the
  // Gregorian date of their Hebrew anniversary for that day's year.
  const personOccursOn = (p: Person, cellDate: Date): boolean => {
    const mode = getDateMode(p);
    const hasHeb = !!(p.hebrewDay && p.hebrewMonth);
    const hebMatch = hasHeb && (() => {
      const anniv = hebrewAnniversaryInGregYear(p.hebrewDay!, p.hebrewMonth!, cellDate.getFullYear());
      return !!anniv && anniv.getMonth() === cellDate.getMonth() && anniv.getDate() === cellDate.getDate();
    })();
    if (mode === 'hebrew') return hebMatch;

    const gregMatch = (() => {
      const pDate = new Date(p.eventDate);
      pDate.setHours(0, 0, 0, 0);
      if (cellDate < pDate) return false;
      if (!p.isRecurring || p.recurrence === 'once') {
        return pDate.getFullYear() === cellDate.getFullYear() && pDate.getMonth() === cellDate.getMonth() && pDate.getDate() === cellDate.getDate();
      }
      if (p.recurrence === 'weekly') return pDate.getDay() === cellDate.getDay();
      if (p.recurrence === 'monthly') return pDate.getDate() === cellDate.getDate();
      return pDate.getDate() === cellDate.getDate() && pDate.getMonth() === cellDate.getMonth();
    })();

    if (mode === 'both') return gregMatch || hebMatch;
    return gregMatch;
  };

  const getEventsForDay = (year: number, month: number, day: number) => {
    const cellDate = new Date(year, month, day);
    cellDate.setHours(0, 0, 0, 0);
    const saved = people.filter(p => personOccursOn(p, cellDate));
    const pending = googleEvents.filter(e => {
      if (importedSourceIds.has(e.id)) return false;
      const [y, m, d] = e.date.split('-').map(Number);
      return y === year && (m - 1) === month && d === day;
    });
    return { saved, pending };
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
      const cellDateObj = new Date(cell.year, cell.month, cell.day);
      cellDateObj.setHours(0, 0, 0, 0);
      const cellEvents = people.filter(p => personOccursOn(p, cellDateObj));

      // Pending (not-yet-imported) Google Calendar events that fall on this cell's date.
      const cellGoogleEvents = googleEvents.filter(e => {
        if (importedSourceIds.has(e.id)) return false;
        const [y, m, d] = e.date.split('-').map(Number);
        return y === cell.year && (m - 1) === cell.month && d === cell.day;
      });

      const isCellToday =
        cell.day === todayDate.getDate() &&
        cell.month === todayDate.getMonth() &&
        cell.year === todayDate.getFullYear();

      const isSelected = !!selectedDay &&
        selectedDay.year === cell.year && selectedDay.month === cell.month && selectedDay.day === cell.day;

      return (
        <div
          key={index}
          className={`calendar-day-cell ${cell.isCurrentMonth ? '' : 'other-month'} ${isCellToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
          onClick={() => {
            setSelectedDay({ year: cell.year, month: cell.month, day: cell.day });
            if (!cell.isCurrentMonth) { setCalendarMonth(cell.month); setCalendarYear(cell.year); }
          }}
        >
          <span className="calendar-day-number">
            {cell.day}
            {settings.showHebrewDates && (
              <span className="calendar-hebrew-day">{hebrewDayLabel(cell.year, cell.month, cell.day)}</span>
            )}
          </span>
          <div className="calendar-birthdays-container">
            {cellEvents.map(p => {
              // Age / anniversary count reached in the year of THIS cell (so past/future months
              // show the age for their own year, not today's).
              const yrs = getYearsForOccurrence(p, cell.year);
              return (
              <div key={p.id} className={`calendar-birthday-dot ${getRelationCategory(p.relation)}`} title={`${p.firstName} (${p.occasion} - ${p.relation}${yrs && yrs > 0 ? ` · ${yrs}` : ''})`}>
                {getOccasionEmoji(p.occasion)} {p.firstName}{yrs && yrs > 0 ? ` (${yrs})` : ''}
              </div>
              );
            })}
            {cellGoogleEvents.map(e => (
              <div
                key={e.id}
                className="calendar-birthday-dot"
                style={{ border: '1px dashed var(--secondary)', background: 'rgba(56, 189, 248, 0.12)' }}
                title={e.title}
              >
                {e.title}
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
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '0.5rem' }}>{t('האפליקציה נעולה')}</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
            {t('הזן/י את סיסמת הנעילה כדי לפתוח את הנתונים המוצפנים.')}
          </p>
          <input
            type="password"
            className="form-input"
            autoFocus
            placeholder={t('סיסמה')}
            value={unlockInput}
            onChange={(e) => setUnlockInput(e.target.value)}
            style={{ marginBottom: '0.75rem', textAlign: 'center' }}
          />
          {unlockError && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{unlockError}</p>}
          <button type="submit" className="btn btn-primary" disabled={unlocking || !unlockInput}>
            {unlocking ? t('פותח...') : t('פתח/י 🔓')}
          </button>
          {isBiometricEnabled() && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginTop: '0.75rem' }}
              onClick={handleBiometricUnlock}
            >
              <span>{t('פתח/י עם טביעת אצבע 👆')}</span>
            </button>
          )}
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
            <h1 className="logo-text" id="main-app-title">{t('מזל טוב!')}</h1>
            <div className="logo-subtitle">{t('מנהל אירועים וברכות חכמות')}</div>
          </div>
        </div>

        <nav className="tabs-nav" id="tabs-navigation">
          <button
            onClick={() => setActiveTab('list')}
            className={`tab-btn ${activeTab === 'list' ? 'active' : ''}`}
            id="tab-events"
          >
            <CalendarIcon size={18} />
            <span>{t('אירועים')}</span>
          </button>
          <button
            onClick={() => setActiveTab("calendar")}
            className={`tab-btn ${activeTab === "calendar" ? "active" : ""}`}
            id="tab-calendar"
          >
            <CalendarIcon size={18} />
            <span>{t('לוח שנה')}</span>
          </button>
          <button
            onClick={handleOpenQuickGenerator}
            className={`tab-btn ${activeTab === "quick-generate" ? "active" : ""}`}
            id="tab-quick-generate"
          >
            <Sparkles size={18} />
            <span>{t('מחולל מהיר')}</span>
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
            id="tab-settings"
          >
            <SettingsIcon size={18} />
            <span>{t('הגדרות')}</span>
          </button>
        </nav>
      </header>

      {/* Update-available banner */}
      {updateInfo?.available && !updateDismissed && (
        <div className="update-banner">
          <span>🔄 {t('גרסה חדשה זמינה')}{updateInfo.label ? ` (${updateInfo.label})` : ''}</span>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: 'auto', padding: '0.3rem 0.7rem', fontSize: '0.8rem' }}
              onClick={() => window.open(updateInfo.url, '_blank')}
            >
              הורד/י
            </button>
            <button type="button" className="icon-btn" onClick={() => setUpdateDismissed(true)} title="סגור">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Birthday Alert Banner */}
      {todaysOccasions.length > 0 && activeTab !== 'settings' && (
        <div className="today-alert-banner glass-card" id="birthday-alert-banner">
          <div className="alert-content">
            <span className="alert-emoji">🥳</span>
            <div>
              <h2 className="alert-title">{t('היום יש אירוע!')}</h2>
              <p className="alert-desc">
                {todaysOccasions.map((p, idx) => {
                  const kind = settings.showHebrewDates ? getOccurrenceDateKind(p, new Date()) : null;
                  const label = dateKindLabel(kind);
                  return (
                  <span key={p.id} style={{ fontWeight: 'bold' }}>
                    {getOccasionEmoji(p.occasion)} {t(p.occasion)} {t('של')} {p.firstName} {p.lastName || ''} ({t(p.relation)}){label ? ` — ${label}` : ''}!
                    {idx < todaysOccasions.length - 1 ? ', ' : ''}
                  </span>
                  );
                })}
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
                <span>{t('ברכה ל')}{p.firstName}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tab Contents */}
      <main>
        {/* Day window: everything on the tapped day — pick synced events to add, or start a new one */}
        {selectedDay && (() => {
          const { saved, pending } = getEventsForDay(selectedDay.year, selectedDay.month, selectedDay.day);
          const dateStr = new Date(selectedDay.year, selectedDay.month, selectedDay.day)
            .toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
          const isoDate = `${selectedDay.year}-${String(selectedDay.month + 1).padStart(2, '0')}-${String(selectedDay.day).padStart(2, '0')}`;
          return (
            <div className="modal-overlay" style={{ zIndex: 3500 }} onClick={() => setSelectedDay(null)}>
              <div className="glass-card modal-content" style={{ maxWidth: '460px' }} onClick={ev => ev.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>{dateStr}</h3>
                  <button type="button" className="icon-btn" onClick={() => setSelectedDay(null)} title="סגור" style={{ flexShrink: 0 }}>
                    <X size={18} />
                  </button>
                </div>

                {saved.length === 0 && pending.length === 0 && (
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>{t('אין אירועים ביום זה.')}</p>
                )}

                {saved.map(p => {
                  const dateKind = settings.showHebrewDates
                    ? getOccurrenceDateKind(p, new Date(selectedDay.year, selectedDay.month, selectedDay.day))
                    : null;
                  // Age / anniversary count for the viewed day's year.
                  const yrs = getYearsForOccurrence(p, selectedDay.year);
                  return (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>{getOccasionEmoji(p.occasion)} {p.firstName} {p.lastName || ''}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t(p.occasion)} · {t(p.relation)}{yrs && yrs > 0 ? ` · ${yrs} ${t('שנים')}` : ''}</div>
                      {dateKind && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--secondary)', marginTop: '0.15rem', fontWeight: 600 }}>{dateKindLabel(dateKind)}</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                      <button type="button" className="btn btn-primary" style={{ width: 'auto', padding: '0.35rem 0.6rem', fontSize: '0.75rem' }} onClick={() => handleOpenGreeting(p)}>{t('ברכה')}</button>
                      <button type="button" className="btn btn-secondary" style={{ width: 'auto', padding: '0.35rem 0.6rem', fontSize: '0.75rem' }} onClick={() => handleStartEdit(p)}>{t('עריכה')}</button>
                    </div>
                  </div>
                  );
                })}

                {pending.length > 0 && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--secondary)', margin: '0.85rem 0 0.35rem' }}>{t('אירועים מהיומן — בחר/י מה להוסיף:')}</p>
                )}
                {pending.map(e => (
                  <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--secondary)' }}>{t('לא נוסף עדיין')}</div>
                    </div>
                    <button type="button" className="btn btn-primary" style={{ width: 'auto', padding: '0.35rem 0.6rem', fontSize: '0.75rem', flexShrink: 0 }} onClick={() => handleReviewImportEvent(e)}>➕ {t('הוסף')}</button>
                  </div>
                ))}

                <button type="button" className="btn btn-secondary" style={{ marginTop: '0.85rem', width: '100%' }} onClick={() => { setSelectedDay(null); resetForm(); setFormDate(isoDate); setShowEventForm(true); }}>
                  <Plus size={14} /> <span>{t('אירוע חדש ביום זה')}</span>
                </button>
              </div>
            </div>
          );
        })()}

        {/* Add/Edit event — modal (opens from the events list OR the calendar) */}
        {showEventForm && (
            <div className="modal-overlay" style={{ zIndex: 4000 }}>
            <section className="glass-card modal-content" id="add-edit-section" style={{ maxWidth: '480px' }}>
              <button type="button" onClick={handleCloseEventForm} className="icon-btn modal-close-btn" title="סגור">
                <X size={20} />
              </button>
              <h2 className="form-title" id="form-heading" style={{ marginBottom: '1rem' }}>
                {editingPerson ? <Edit size={20} /> : <Plus size={20} />}
                <span>{editingPerson ? t('עריכת אירוע') : t('הוספת אירוע')}</span>
              </h2>

              <form onSubmit={handleSubmitPerson}>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => openContactsModal('form')}
                    style={{ fontSize: '0.8rem', padding: '0.5rem 0.75rem' }}
                  >
                    <Import size={14} />
                    <span>{t('ייבוא מאנשי קשר 📱')}</span>
                  </button>
                </div>

                {/* Feature 3: Separate First Name and Surname */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" htmlFor="input-first-name">{t('שם פרטי')}</label>
                    <input
                      id="input-first-name"
                      type="text"
                      required
                      className="form-input"
                      placeholder={t('ישראל')}
                      value={formFirstName}
                      onChange={(e) => setFormFirstName(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" htmlFor="input-last-name">{t('שם משפחה')}</label>
                    <input
                      id="input-last-name"
                      type="text"
                      className="form-input"
                      placeholder={t('ישראלי')}
                      value={formLastName}
                      onChange={(e) => setFormLastName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="select-occasion">{t('סוג האירוע')}</label>
                  <select
                    id="select-occasion"
                    className="form-select"
                    value={(OCCASIONS.includes(formOccasion as typeof OCCASIONS[number]) && formOccasion !== 'אחר') ? formOccasion : 'אחר'}
                    onChange={(e) => setFormOccasion(e.target.value === 'אחר' ? '' : e.target.value)}
                  >
                    {OCCASIONS.map(o => (
                      <option key={o} value={o}>{o === 'אחר' ? t('אחר (טקסט חופשי)') : t(o)}</option>
                    ))}
                  </select>
                  {(!OCCASIONS.includes(formOccasion as typeof OCCASIONS[number]) || formOccasion === 'אחר') && (
                    <input
                      type="text"
                      className="form-input"
                      style={{ marginTop: '0.5rem' }}
                      placeholder={t('הקלד/י סוג אירוע מותאם אישית (למשל: בר מצווה, פרישה...)')}
                      value={formOccasion === 'אחר' ? '' : formOccasion}
                      onChange={(e) => setFormOccasion(e.target.value)}
                    />
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="input-date">{t('תאריך האירוע')}</label>
                  <input
                    id="input-date"
                    type="date"
                    required
                    className="form-input numbers-font"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                  />
                </div>

                {/* Hebrew date (auto from the Gregorian date, editable, opt-in for recurrence) */}
                {settings.showHebrewDates && !!formHebrewDay && !!formHebrewMonth && (
                  <div className="form-group">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        🕎 {t('תאריך עברי')}: <strong>{formatHebrewDate(formHebrewDay, formHebrewMonth)}</strong>
                      </span>
                      <button type="button" className="btn btn-secondary" style={{ width: 'auto', padding: '0.2rem 0.55rem', fontSize: '0.75rem' }} onClick={() => setShowHebrewEdit(v => !v)}>
                        {showHebrewEdit ? t('סגור') : t('ערוך')}
                      </button>
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', fontSize: '0.8rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                      <input
                        type="checkbox"
                        checked={formHebrewAfterSunset}
                        onChange={(e) => { setFormHebrewAfterSunset(e.target.checked); setFormHebrewEdited(false); }}
                      />
                      <span>{t('נולד/ה אחרי השקיעה (התאריך העברי מתחלף בשקיעה)')}</span>
                    </label>

                    {showHebrewEdit && (
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                        <select
                          className="form-select" style={{ width: 'auto', minWidth: '70px' }}
                          value={formHebrewDay}
                          onChange={(e) => { setFormHebrewDay(Number(e.target.value)); setFormHebrewEdited(true); }}
                        >
                          {Array.from({ length: 30 }, (_, i) => i + 1).map(d => (
                            <option key={d} value={d}>{dayGematriya(d)}</option>
                          ))}
                        </select>
                        <select
                          className="form-select" style={{ width: 'auto', flex: 1, minWidth: '120px' }}
                          value={formHebrewMonth}
                          onChange={(e) => { setFormHebrewMonth(Number(e.target.value)); setFormHebrewEdited(true); }}
                        >
                          {JEWISH_MONTHS.map(m => <option key={m.num} value={m.num}>{m.name}</option>)}
                        </select>
                        {formHebrewEdited && (
                          <button type="button" className="btn btn-secondary" style={{ width: 'auto', padding: '0.3rem 0.6rem', fontSize: '0.72rem' }} onClick={() => setFormHebrewEdited(false)}>
                            {t('אפס לאוטומטי')}
                          </button>
                        )}
                      </div>
                    )}

                    <div style={{ marginTop: '0.75rem' }}>
                      <label className="form-label" htmlFor="select-date-mode" style={{ fontSize: '0.85rem' }}>{t('מתי לברך / להזכיר')}</label>
                      <select
                        id="select-date-mode"
                        className="form-select"
                        value={formDateMode}
                        onChange={(e) => setFormDateMode(e.target.value as 'gregorian' | 'hebrew' | 'both')}
                      >
                        <option value="gregorian">{t('בתאריך הלועזי בלבד')}</option>
                        <option value="hebrew">{t('בתאריך העברי בלבד')}</option>
                        <option value="both">{t('בשני התאריכים')}</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* Feature 1: Event Periodicity Dropdown */}
                <div className="form-group">
                  <label className="form-label" htmlFor="select-recurrence-type">{t('מחזוריות האירוע')}</label>
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
                    <option value="once">{t('אירוע חד-פעמי (ללא חזרה)')}</option>
                    <option value="yearly">{t('שנתי (חוזר כל שנה)')}</option>
                    <option value="monthly">{t('חודשי (חוזר כל חודש)')}</option>
                    <option value="weekly">{t('שבועי (חוזר כל שבוע)')}</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="select-relation">{t('מערכת יחסים')}</label>
                  <select
                    id="select-relation"
                    className="form-select"
                    value={(RELATIONS.includes(formRelation) && formRelation !== 'אחר') ? formRelation : 'אחר'}
                    onChange={(e) => e.target.value === 'אחר' ? setFormRelation('') : handleRelationChange(e.target.value)}
                  >
                    {RELATIONS.map(r => (
                      <option key={r} value={r}>{r === 'אחר' ? t('אחר (טקסט חופשי)') : t(r)}</option>
                    ))}
                  </select>
                  {(!RELATIONS.includes(formRelation) || formRelation === 'אחר') && (
                    <input
                      type="text"
                      className="form-input"
                      style={{ marginTop: '0.5rem' }}
                      placeholder={t('הקלד/י קשר מותאם אישית (למשל: מנהל/ת, מורה, בן/בת דוד שני...)')}
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
                    <span>{t('השתמש בשם פרטי בלבד בברכה')}</span>
                  </label>
                </div>

                <div className="form-group">
                  <label className="form-label">{t('מגדר (עבור דקדוק הברכה)')}</label>
                  <div className="gender-radio-group">
                    <label className="gender-radio-label">
                      <input
                        type="radio"
                        name="gender"
                        className="gender-radio-input"
                        checked={formGender === 'Male'}
                        onChange={() => setFormGender('Male')}
                      />
                      <span>{t('זכר')}</span>
                    </label>
                    <label className="gender-radio-label">
                      <input
                        type="radio"
                        name="gender"
                        className="gender-radio-input"
                        checked={formGender === 'Female'}
                        onChange={() => setFormGender('Female')}
                      />
                      <span>{t('נקבה')}</span>
                    </label>
                    <label className="gender-radio-label">
                      <input
                        type="radio"
                        name="gender"
                        className="gender-radio-input"
                        checked={formGender === 'Couple'}
                        onChange={() => setFormGender('Couple')}
                      />
                      <span>{t('זוג / רבים')}</span>
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
                    <span>{t('שליחת הברכה דרך מישהו אחר (פרוקסי)')}</span>
                  </label>
                  {formViaProxy && (
                    <div style={{ marginTop: '0.6rem', padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--panel-border)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0, lineHeight: '1.4' }}>
                        הברכה תופנה אל מקבל/ת הברכה (למשל אח/ות או קבוצת משפחה) ותברך אותו/ה לרגל האירוע של <strong>{formFirstName || 'בעל האירוע'}</strong>. הטלפון למעלה ישמש לשליחה אל מקבל/ת הברכה.
                      </p>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>{t('שם מקבל/ת הברכה (למי לשלוח)')}</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder={t('למשל: דני / משפחת כהן')}
                          value={formProxyName}
                          onChange={(e) => setFormProxyName(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>{t('מגדר מקבל/ת הברכה')}</label>
                        <div className="gender-radio-group">
                          <label className="gender-radio-label" style={{ fontSize: '0.8rem' }}>
                            <input type="radio" name="proxyGender" className="gender-radio-input" checked={formProxyGender === 'Male'} onChange={() => setFormProxyGender('Male')} />
                            <span>{t('זכר')}</span>
                          </label>
                          <label className="gender-radio-label" style={{ fontSize: '0.8rem' }}>
                            <input type="radio" name="proxyGender" className="gender-radio-input" checked={formProxyGender === 'Female'} onChange={() => setFormProxyGender('Female')} />
                            <span>{t('נקבה')}</span>
                          </label>
                          <label className="gender-radio-label" style={{ fontSize: '0.8rem' }}>
                            <input type="radio" name="proxyGender" className="gender-radio-input" checked={formProxyGender === 'Couple'} onChange={() => setFormProxyGender('Couple')} />
                            <span>{t('זוג / רבים')}</span>
                          </label>
                        </div>
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>{t('הקשר של בעל/ת האירוע למקבל/ת הברכה (אופציונלי)')}</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder={t('למשל: הבן שלך, הנכדה שלכם')}
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
                    <span>{t('הגדרות התראה (אנדרואיד / דפדפן)')}</span>
                  </label>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.4rem' }}>
                    <div>
                      <label className="form-label" htmlFor="select-notify-days" style={{ fontSize: '0.75rem' }}>{t('מועד ההתראה')}</label>
                      <select
                        id="select-notify-days"
                        className="form-select"
                        style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                        value={formNotifyDays}
                        onChange={(e) => setFormNotifyDays(Number(e.target.value))}
                      >
                        <option value={0}>{t('ביום האירוע')}</option>
                        <option value={1}>{t('יום לפני')}</option>
                        <option value={2}>{t('יומיים לפני')}</option>
                        <option value={7}>{t('שבוע לפני')}</option>
                      </select>
                    </div>

                    <div>
                      <label className="form-label" htmlFor="input-notify-hour" style={{ fontSize: '0.75rem' }}>{t('שעת ההתראה')}</label>
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
                  <label className="form-label" htmlFor="input-phone">{t('טלפון לשליחה בוואטסאפ (אופציונלי)')}</label>
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
                  <label className="form-label" htmlFor="input-notes">{t('הערות נוספות (תחביבים, איחולים מיוחדים)')}</label>
                  <textarea
                    id="input-notes"
                    rows={2}
                    className="form-textarea"
                    placeholder={t('אוהב שוקולד, קודם לאחרונה, מאחל לו הצלחה...')}
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                  <button type="submit" className="btn btn-primary" id="btn-submit-form" style={{ flex: 1 }}>
                    {editingPerson ? t('שמור שינויים') : t('הוסף אירוע')}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={handleCloseEventForm} style={{ flex: 1 }}>
                    {t('ביטול')}
                  </button>
                </div>
              </form>
            </section>
            </div>
        )}

        {activeTab === 'list' && (
          <section className="glass-card section-panel" id="contacts-list-section">
              <div className="list-sticky-header">
                <div className="panel-header" style={{ marginBottom: '0.85rem' }}>
                  <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>{t('אירועים')}</h2>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }} className="numbers-font">
                    {filteredPeople.length} {t('מתוך')} {people.length}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleNewEvent}
                    style={{ width: 'auto', flexShrink: 0, padding: '0 0.85rem' }}
                  >
                    <Plus size={16} />
                    <span>{t('אירוע חדש')}</span>
                  </button>
                  <div className="search-container" style={{ marginBottom: 0, flex: 1 }}>
                    <input
                      type="text"
                      className="form-input search-input"
                      placeholder={t('חיפוש...')}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      id="search-contacts-input"
                    />
                    <Search className="search-icon" size={18} />
                    {searchQuery && (
                      <button
                        type="button"
                        className="search-clear-btn"
                        onClick={() => setSearchQuery('')}
                        title={t('נקה חיפוש')}
                        aria-label={t('נקה חיפוש')}
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    className="icon-btn"
                    title={t('גלילה למעלה')}
                    onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                    style={{ flexShrink: 0 }}
                  >
                    <ArrowUp size={18} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title={t('גלילה לתחתית')}
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
                  // Age/anniversary count reached on the UPCOMING date (not the current age).
                  const years = getCelebrationYears(person);
                  
                  let daysBadgeClass = 'far';
                  let daysBadgeText = '';
                  
                  if (daysLeft === -1) {
                    daysBadgeClass = 'far';
                    daysBadgeText = t('אירוע עבר (חד פעמי)');
                  } else if (daysLeft === 0) {
                    daysBadgeClass = 'today';
                    daysBadgeText = t('היום! 🥳');
                  } else if (daysLeft === 1) {
                    daysBadgeClass = 'soon';
                    daysBadgeText = t('מחר! ⏳');
                  } else if (daysLeft <= 14) {
                    daysBadgeClass = 'soon';
                    daysBadgeText = `${t('בעוד')} ${daysLeft} ${t('ימים')} ⏳`;
                  } else {
                    daysBadgeClass = 'far';
                    daysBadgeText = `${t('בעוד')} ${daysLeft} ${t('ימים')}`;
                  }

                  const relationClass = getRelationCategory(person.relation);

                  return (
                    <div key={person.id} className={`person-card glass-card ${relationClass}`}>
                      <div className="person-card-header">
                        <div className="person-name">
                          <span style={{ fontSize: '1.2rem', marginRight: '2px' }}>{getOccasionEmoji(person.occasion)}</span>
                          <span>{person.firstName} {person.lastName || ''}</span>
                          <span className={`gender-badge ${person.gender === 'Female' ? 'female' : 'male'}`}>
                            {t(getGenderLabel(person.gender))}
                          </span>
                        </div>
                        <span className="person-relation">{t(person.relation)}</span>
                      </div>

                      <div className="person-birthday-row">
                        <CalendarIcon size={14} />
                        <span className="numbers-font">{person.eventDate.split('-').reverse().join('/')}</span>
                        <span style={{ opacity: 0.5 }}>|</span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary)' }}>
                          {t(person.occasion)} {years > 0 ? `(${years})` : ''}
                        </span>
                      </div>

                      <div className="person-birthday-row" style={{ fontSize: '0.75rem', opacity: 0.85 }}>
                        <span style={{ background: 'rgba(255,255,255,0.03)', padding: '0.1rem 0.4rem', borderRadius: '4px', border: '1px solid var(--panel-border)' }}>
                          {person.isRecurring ? `${t('מחזורי')} (${person.recurrence === 'yearly' ? t('שנתי') : person.recurrence === 'monthly' ? t('חודשי') : t('שבועי')})` : t('אירוע חד פעמי')}
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
                        <span>{t('התראה')}: {person.notifyDaysBefore === 0 ? t('ביום האירוע') : person.notifyDaysBefore === 1 ? t('יום לפני') : `${person.notifyDaysBefore} ${t('ימים לפני')}`} {t('בשעה')} <span className="numbers-font">{person.notifyHour}</span></span>
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
                            title={t('צור ברכה חכמה')}
                          >
                            <Sparkles size={14} />
                            <span>{t('ברכה')} ✨</span>
                          </button>

                          <button
                            onClick={() => handleStartEdit(person)}
                            className="icon-btn"
                            title={t('ערוך איש קשר')}
                          >
                            <Edit size={16} />
                          </button>

                          <button
                            onClick={() => handleDeletePerson(person.id, person.firstName)}
                            className="icon-btn delete"
                            title={t('מחק איש קשר')}
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
                  {t('לא נמצאו אירועים מתאימים לחיפוש.')}
                </div>
              )}
            </section>
        )}

        {activeTab === 'calendar' && (
          <section className="glass-card section-panel calendar-view-container" id="calendar-section">
            <div className="calendar-header">
              <button onClick={handleNextMonth} className="calendar-nav-btn" title={t('חודש הבא')}>
                <ChevronRight size={20} />
              </button>
              <h2 className="calendar-title-text" id="calendar-month-year">
                {t(HEBREW_MONTHS[calendarMonth])} {calendarYear}
                {settings.showHebrewDates && (
                  <span className="calendar-hebrew-title">{hebrewMonthYearLabel(calendarYear, calendarMonth)}</span>
                )}
              </h2>
              <button onClick={handlePrevMonth} className="calendar-nav-btn" title={t('חודש קודם')}>
                <ChevronLeft size={20} />
              </button>
            </div>

            {/* Calendar sync bar */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: 'auto', fontSize: '0.85rem' }}
                onClick={() => syncGoogleCalendar()}
                disabled={calendarLoading}
              >
                {calendarLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px', margin: 0 }}></div>
                    <span>{t('מסנכרן...')}</span>
                  </div>
                ) : (
                  <>
                    <CalendarIcon size={14} />
                    <span>{t('סנכרן אירועים (מכשיר + Google)')}</span>
                  </>
                )}
              </button>
              {(() => {
                if (calendarError === 'not-connected') {
                  return (
                    <button type="button" className="btn btn-primary" style={{ width: 'auto', fontSize: '0.8rem', padding: '0.4rem 0.8rem', background: '#4285F4' }} onClick={() => handleGoogleLoginFor('calendar')} disabled={isLoggingIn}>
                      <LogIn size={14} />
                      <span>{isLoggingIn ? t('מתחבר...') : t('התחבר/י עם Google')}</span>
                    </button>
                  );
                }
                if (calendarError) {
                  return <span style={{ fontSize: '0.8rem', color: 'var(--danger, #ff5c5c)' }}>{calendarError}</span>;
                }
                if (!calendarLoading && googleEvents.length > 0) {
                  const pending = googleEvents.filter(e => !importedSourceIds.has(e.id)).length;
                  return (
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {pending > 0 ? `${t('נמצאו')} ${pending} ${t('אירועים — הקש/י על יום לייבוא')} ➕` : t('כל האירועים יובאו 🎉')}
                    </span>
                  );
                }
                return null;
              })()}
            </div>

            <div className="calendar-days-grid">
              {WEEKDAYS.map(d => (
                <div key={d} className="calendar-weekday-label">{t(d)}</div>
              ))}
              {renderCalendarCells()}
            </div>

            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1.2rem', justifyContent: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }}></span>
                <span>{t('בן/בת זוג')}</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--primary)', flexShrink: 0 }}></span>
                <span>{t('משפחה')}</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--secondary)', flexShrink: 0 }}></span>
                <span>{t('חברים ואחרים')}</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '3px', border: '1px dashed var(--secondary)', background: 'rgba(56, 189, 248, 0.12)', flexShrink: 0 }}></span>
                <span>{t('אירוע מהיומן (הקש על היום)')}</span>
              </span>
            </div>
          </section>
        )}

        {activeTab === 'quick-generate' && (
          <section className="glass-card section-panel" id="quick-generate-section">
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Sparkles size={22} style={{ color: 'var(--primary)' }} />
              <span>{t('מחולל ברכות מהיר (על פי דרישה) ⚡')}</span>
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              {t('יצירת ברכה חכמה ללא שמירה. מלא/י את הפרטים וקבל/י ברכה.')}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem', padding: '1rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--secondary)', marginBottom: 0 }}>{t('פרטי מקבל הברכה')}:</h4>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => openContactsModal('quick')}
                  style={{ width: 'auto', fontSize: '0.78rem', padding: '0.35rem 0.7rem', flexShrink: 0 }}
                >
                  <Import size={13} />
                  <span>{t('ייבוא מאנשי קשר 📱')}</span>
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', alignItems: 'end' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>{t('שם פרטי')}</label>
                  <input
                    type="text"
                    className="form-input"
                    style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                    placeholder={t('ישראל')}
                    value={quickFirstName}
                    onChange={(e) => setQuickFirstName(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>{t('שם משפחה (אופציונלי)')}</label>
                  <input
                    type="text"
                    className="form-input"
                    style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                    placeholder={t('ישראלי')}
                    value={quickLastName}
                    onChange={(e) => setQuickLastName(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 0.8fr', gap: '0.75rem', alignItems: 'end' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>{t('סוג האירוע')}</label>
                  <select
                    className="form-select"
                    style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                    value={quickOccasion}
                    onChange={(e) => setQuickOccasion(e.target.value as any)}
                  >
                    {OCCASIONS.map(o => (
                      <option key={o} value={o}>{t(o)}</option>
                    ))}
                  </select>
                </div>
                
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>{t('קשר משפחתי/חברתי')}</label>
                  <select
                    className="form-select"
                    style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                    value={quickRelation}
                    onChange={(e) => handleQuickRelationChange(e.target.value)}
                  >
                    {RELATIONS.map(r => (
                      <option key={r} value={r}>{t(r)}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>{t('גיל/שנים')}</label>
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

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem', flexWrap: 'wrap', gap: '0.5rem 1rem' }}>
                <div className="gender-radio-group" style={{ gap: '1rem' }}>
                  <label className="gender-radio-label" style={{ fontSize: '0.8rem' }}>
                    <input
                      type="radio"
                      name="quickGender"
                      className="gender-radio-input"
                      checked={quickGender === 'Male'}
                      onChange={() => setQuickGender('Male')}
                    />
                    <span>{t('זכר')}</span>
                  </label>
                  <label className="gender-radio-label" style={{ fontSize: '0.8rem' }}>
                    <input
                      type="radio"
                      name="quickGender"
                      className="gender-radio-input"
                      checked={quickGender === 'Female'}
                      onChange={() => setQuickGender('Female')}
                    />
                    <span>{t('נקבה')}</span>
                  </label>
                  <label className="gender-radio-label" style={{ fontSize: '0.8rem' }}>
                    <input
                      type="radio"
                      name="quickGender"
                      className="gender-radio-input"
                      checked={quickGender === 'Couple'}
                      onChange={() => setQuickGender('Couple')}
                    />
                    <span>{t('זוג / רבים')}</span>
                  </label>
                </div>

                <label className="gender-radio-label" style={{ fontSize: '0.8rem' }}>
                  <input
                    type="checkbox"
                    checked={quickUseFirstNameOnly}
                    onChange={(e) => setQuickUseFirstNameOnly(e.target.checked)}
                    style={{ width: '15px', height: '15px', accentColor: 'var(--primary)' }}
                  />
                  <span>{t('שם פרטי בלבד בברכה')}</span>
                </label>
              </div>

              <label className="gender-radio-label" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                <input
                  type="checkbox"
                  checked={quickViaProxy}
                  onChange={(e) => setQuickViaProxy(e.target.checked)}
                  style={{ width: '15px', height: '15px', accentColor: 'var(--primary)' }}
                />
                <span>{t('שליחה דרך מישהו אחר (פרוקסי)')}</span>
              </label>
              {quickViaProxy && (
                <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '0.6rem', alignItems: 'end', padding: '0.6rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.72rem' }}>{t('שם מקבל/ת הברכה')}</label>
                    <input
                      type="text"
                      className="form-input"
                      style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                      placeholder={t('למשל: דני / משפחת כהן')}
                      value={quickProxyName}
                      onChange={(e) => setQuickProxyName(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.72rem' }}>{t('מגדר המקבל/ת')}</label>
                    <select
                      className="form-select"
                      style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                      value={quickProxyGender}
                      onChange={(e) => setQuickProxyGender(e.target.value as Person['gender'])}
                    >
                      <option value="Male">{t('זכר')}</option>
                      <option value="Female">{t('נקבה')}</option>
                      <option value="Couple">{t('זוג / רבים')}</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                    <label className="form-label" style={{ fontSize: '0.72rem' }}>{t('הקשר של בעל/ת האירוע למקבל/ת (אופציונלי)')}</label>
                    <input
                      type="text"
                      className="form-input"
                      style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                      placeholder={t('למשל: הבן שלך, הנכדה שלכם')}
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
                <span>{t('ייצר ברכה מהירה באמצעות AI')} ✨</span>
              </button>
            </div>

            {/* Preview Box */}
            <div className={`greeting-preview-box ${isGenerating ? 'loading' : ''}`} id="greeting-preview-box" style={{ minHeight: '180px', marginBottom: '1.5rem' }}>
              {isGenerating ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div className="spinner"></div>
                  <span>{t('מנסח ברכה...')}</span>
                </div>
              ) : (
                <textarea
                  className="greeting-edit-textarea"
                  value={greetingText}
                  onChange={(e) => setGreetingText(e.target.value)}
                  placeholder={t('הברכה תופיע כאן וניתנת לעריכה לפני שליחה. מלא/י את הפרטים ולחץ/י "ייצר ברכה".')}
                  dir={greetingLang === 'en' ? 'ltr' : 'rtl'}
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
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem' }}>{t('התאמת הברכה מחדש')}:</h3>
              
              <div className="greeting-options-grid">
                <div className="form-group">
                  <label className="form-label">{t('שפת הברכה')}</label>
                  <div className="tone-selector-buttons">
                    <button
                      type="button"
                      className={`tone-btn ${greetingLang === 'he' ? 'active' : ''}`}
                      onClick={() => { setGreetingLang('he'); handleRegenerateGreeting(greetingTone, customGreetingDetails, undefined, 'he'); }}
                    >
                      {t('עברית')}
                    </button>
                    <button
                      type="button"
                      className={`tone-btn ${greetingLang === 'en' ? 'active' : ''}`}
                      onClick={() => { setGreetingLang('en'); handleRegenerateGreeting(greetingTone, customGreetingDetails, undefined, 'en'); }}
                    >
                      {t('אנגלית')}
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('סגנון / טון הברכה')}</label>
                  <div className="tone-selector-buttons">
                    <button
                      className={`tone-btn ${greetingTone === 'normal' ? 'active' : ''}`}
                      onClick={() => {
                        setGreetingTone('normal'); setGreetingLang(settings.language || 'he');
                        handleRegenerateGreeting('normal', customGreetingDetails);
                      }}
                    >
                      {t('חם / רגיל')}
                    </button>
                    <button
                      className={`tone-btn ${greetingTone === 'funny' ? 'active' : ''}`}
                      onClick={() => {
                        setGreetingTone('funny');
                        handleRegenerateGreeting('funny', customGreetingDetails);
                      }}
                    >
                      {t('מצחיק')}
                    </button>
                    <button
                      className={`tone-btn ${greetingTone === 'emotional' ? 'active' : ''}`}
                      onClick={() => {
                        setGreetingTone('emotional');
                        handleRegenerateGreeting('emotional', customGreetingDetails);
                      }}
                    >
                      {t('מרגש')}
                    </button>
                    <button
                      className={`tone-btn ${greetingTone === 'short' ? 'active' : ''}`}
                      onClick={() => {
                        setGreetingTone('short');
                        handleRegenerateGreeting('short', customGreetingDetails);
                      }}
                    >
                      {t('קצר')}
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="custom-instruction">{t('הנחיה מיוחדת ל-AI')}</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <textarea
                      id="custom-instruction"
                      rows={5} /* Increased rows for better visibility */
                      maxLength={MAX_CUSTOM_INSTRUCTION_LEN}
                      className="form-textarea"
                      style={{ fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}
                      placeholder={t('הוסף בקשה מיוחדת או פרטים לכלול...')}
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
                      {t('עדכן ונסח מחדש באמצעות AI')} 🪄
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
                <span>{copyFeedback ? t('הועתק!') : t('העתק ברכה')}</span>
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
                <span>{t('שלח בוואטסאפ')}</span>
              </button>
            </div>

            {/* Save current greeting as a quick draft (Feature 2) */}
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%', marginTop: '1rem' }}
              onClick={handleSaveQuickDraft}
              disabled={isGenerating || !greetingText.trim()}
              id="btn-save-quick-draft"
            >
              <Save size={16} />
              <span>{draftFeedback === 'saved' ? t('נשמר!') : t('שמור טיוטה')}</span>
            </button>

            {/* Saved quick drafts list (load / delete — Features 2, 4) */}
            {quickDrafts.length > 0 && (
              <div style={{ marginTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1.25rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Bookmark size={18} style={{ color: 'var(--primary)' }} />
                  <span>{t('טיוטות שמורות')} ({quickDrafts.length})</span>
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {quickDrafts.map(d => (
                    <div key={d.id} className="glass-card" style={{ padding: '0.75rem', border: '1px solid var(--panel-border)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, color: 'var(--secondary)' }}>{d.firstName}{d.lastName ? ` ${d.lastName}` : ''} • {t(d.occasion)}</span>
                        <span className="numbers-font">{new Date(d.createdAt).toLocaleDateString()}</span>
                      </div>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, whiteSpace: 'pre-wrap', maxHeight: '4.5em', overflow: 'hidden', lineHeight: '1.5' }} dir={d.lang === 'en' ? 'ltr' : 'rtl'}>
                        {d.text}
                      </p>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ flex: 1, padding: '0.35rem 0.7rem', fontSize: '0.78rem' }}
                          onClick={() => handleLoadQuickDraft(d)}
                        >
                          <Import size={13} />
                          <span>{t('טען טיוטה')}</span>
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          style={{ color: 'var(--danger, #ff5c5c)' }}
                          title={t('מחק טיוטה')}
                          onClick={() => handleDeleteQuickDraft(d.id)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {activeTab === 'settings' && (
          <section className="glass-card section-panel settings-panel" id="settings-section">
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '1rem' }}>{t('הגדרות האפליקציה')}</h2>

            {/* Language */}
            <div className="glass-card" style={{ padding: '1.25rem 1.5rem', marginBottom: '2rem', border: '1px solid rgba(255,255,255,0.08)' }}>
              <label className="form-label" htmlFor="select-language">🌐 {t('שפה')}</label>
              <select
                id="select-language"
                className="form-select"
                value={settings.language || 'he'}
                onChange={(e) => setLocalSettings({ ...settings, language: e.target.value as 'he' | 'en' })}
              >
                <option value="he">עברית</option>
                <option value="en">English</option>
              </select>
            </div>

            {/* Share / import events */}
            <div className="glass-card" style={{ padding: '1.25rem 1.5rem', marginBottom: '2rem', border: '1px solid rgba(255,255,255,0.08)' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Share2 size={18} />
                <span>{t('שיתוף וגיבוי אירועים')}</span>
              </h3>
              <p className="settings-description" style={{ fontSize: '0.82rem', marginBottom: '1rem', lineHeight: '1.5' }}>
                {t('ייצוא אירועים כקובץ מוצפן לשיתוף עם מכשיר או אדם אחר. הקוד נשלח בנפרד.')}
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-primary" style={{ width: 'auto' }} onClick={openShareModal} disabled={people.length === 0}>
                  <Share2 size={16} /> <span>{t('שתף/י אירועים')}</span>
                </button>
                <button type="button" className="btn btn-secondary" style={{ width: 'auto' }} onClick={openImportModal}>
                  <Import size={16} /> <span>{t('ייבוא אירועים')}</span>
                </button>
              </div>
            </div>

            {/* Google Authentication Box */}
            <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '2rem', border: '1px solid rgba(138,43,226,0.2)' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <LogIn size={20} style={{ color: 'var(--secondary)' }} />
                <span>{t('התחברות מאובטחת עם Google')}</span>
              </h3>
              <p className="settings-description" style={{ fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                {t('התחברות עם Google מאפשרת לייבא אירועים ואנשי קשר (קריאה בלבד, בהרשאתך).')}
                {t('שים/י לב: ההתחברות אינה מספקת גישה ל-AI — ליצירת ברכות נדרש מפתח נפרד (למטה).')}
              </p>

              {settings.useGoogleAuth ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', background: 'rgba(0, 230, 118, 0.08)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--success)' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 'bold', color: 'var(--success)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
                      <CheckCircle size={16} />
                      <span>{t('מחובר בהצלחה עם Google')}</span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem', wordBreak: 'break-word' }}>
                      שם: {settings.googleUserName} ({settings.googleUserEmail})
                    </div>
                  </div>
                  <button
                    onClick={handleGoogleLogout}
                    className="btn btn-secondary"
                    style={{ width: 'auto', padding: '0.4rem 0.8rem', fontSize: '0.8rem', flexShrink: 0 }}
                  >
                    <LogOut size={14} />
                    <span>{t('התנתק')}</span>
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
                      <span>{t('התחברות מהירה עם Google')}</span>
                    </div>
                  )}
                </button>
              )}
            </div>

            {/* App Lock (at-rest encryption) */}
            <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '2rem', border: '1px solid rgba(0, 230, 118, 0.15)' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>🔒</span>
                <span>{t('נעילת אפליקציה (הצפנת נתונים)')}</span>
              </h3>
              <p className="settings-description" style={{ fontSize: '0.85rem', marginBottom: '1rem', lineHeight: '1.5' }}>
                {t('הצפנת כל הנתונים במכשיר בעזרת סיסמה. בכל פתיחה תידרש/י להזין אותה.')}
              </p>

              {lockEnabled ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--success)', fontWeight: 'bold', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <CheckCircle size={16} />
                    {t('הנעילה פעילה — הנתונים מוצפנים.')}
                  </span>
                  <button type="button" className="btn btn-secondary" style={{ width: 'auto' }} onClick={handleDisableLock}>
                    {t('בטל/י נעילה')}
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <input
                    type="password"
                    className="form-input"
                    placeholder={t('סיסמת נעילה חדשה')}
                    value={newPassphrase}
                    onChange={(e) => { setNewPassphrase(e.target.value); setLockSetupError(''); }}
                  />
                  <input
                    type="password"
                    className="form-input"
                    placeholder={t('אישור סיסמה')}
                    value={confirmPassphrase}
                    onChange={(e) => { setConfirmPassphrase(e.target.value); setLockSetupError(''); }}
                  />
                  {lockSetupError && <p style={{ color: 'var(--danger)', fontSize: '0.82rem', margin: 0 }}>{lockSetupError}</p>}
                  {biometricSupported && (
                    <label className="gender-radio-label" style={{ fontSize: '0.85rem' }}>
                      <input
                        type="checkbox"
                        checked={useBiometricChecked}
                        onChange={(e) => setUseBiometricChecked(e.target.checked)}
                        style={{ width: '18px', height: '18px', accentColor: 'var(--primary)' }}
                      />
                      <span>{t('אפשר/י פתיחה גם בטביעת אצבע 👆')}</span>
                    </label>
                  )}
                  <p style={{ fontSize: '0.72rem', color: 'var(--warning)', margin: 0, lineHeight: '1.4' }}>
                    {t('⚠️ שמור/י את הסיסמה — אם תישכח, לא ניתן לשחזר את הנתונים המוצפנים.')}
                  </p>
                  <button type="button" className="btn btn-primary" style={{ width: 'auto' }} onClick={handleEnableLock} disabled={!newPassphrase || !confirmPassphrase}>
                    {t('הפעל/י נעילה')}
                  </button>
                </div>
              )}
            </div>

            <form onSubmit={handleSaveSettings}>
              <div className="form-group" style={{ paddingBottom: '1.25rem', marginBottom: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <label className="form-label">{t('המגדר שלך (כותב/ת הברכה)')}</label>
                <div className="gender-radio-group">
                  <label className="gender-radio-label">
                    <input
                      type="radio"
                      name="senderGender"
                      className="gender-radio-input"
                      checked={(settings.senderGender || 'Male') === 'Male'}
                      onChange={() => setLocalSettings({ ...settings, senderGender: 'Male' })}
                    />
                    <span>{t('זכר (מאחל)')}</span>
                  </label>
                  <label className="gender-radio-label">
                    <input
                      type="radio"
                      name="senderGender"
                      className="gender-radio-input"
                      checked={settings.senderGender === 'Female'}
                      onChange={() => setLocalSettings({ ...settings, senderGender: 'Female' })}
                    />
                    <span>{t('נקבה (מאחלת)')}</span>
                  </label>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem', lineHeight: '1.4' }}>
                  {t('הברכות נכתבות בגוף ראשון — קובע אם ייכתב "מאחל" או "מאחלת".')}
                </p>

                <label className="form-label" style={{ marginTop: '0.9rem' }}>{t('השם שלך בעברית (לחתימת הברכה)')}</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder={t('למשל: דנה')}
                  value={settings.senderName || ''}
                  onChange={(e) => setLocalSettings({ ...settings, senderName: e.target.value })}
                />
                <label className="form-label" style={{ marginTop: '0.6rem' }}>{t('השם שלך באנגלית')}</label>
                <input
                  type="text"
                  className="form-input"
                  dir="ltr"
                  placeholder="e.g. Dana"
                  value={settings.senderNameEn || ''}
                  onChange={(e) => setLocalSettings({ ...settings, senderNameEn: e.target.value })}
                />
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem', lineHeight: '1.4' }}>
                  {t('אם תזין/י שם, הברכות ייחתמו בו (לפי שפת הברכה). השאר/י ריק לברכה ללא חתימה.')}
                </p>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', marginTop: '1rem' }}>
                  <input
                    type="checkbox"
                    checked={!!settings.showHebrewDates}
                    onChange={(e) => setLocalSettings({ ...settings, showHebrewDates: e.target.checked })}
                  />
                  <span style={{ fontWeight: 700 }}>{t('🕎 הצג תאריכים עבריים')}</span>
                </label>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem', lineHeight: '1.4' }}>
                  {t('מציג תאריך עברי לצד הלועזי בלוח ובטופס, עם אפשרות לחשב תזכורות לפי התאריך העברי לכל אירוע.')}
                </p>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="select-ai-provider">{t('ספק הבינה המלאכותית (AI)')}</label>
                <select
                  id="select-ai-provider"
                  className="form-select"
                  value={settings.aiProvider || 'gemini'}
                  onChange={(e) => { setLocalSettings({ ...settings, aiProvider: e.target.value as AiProvider }); setKeyTestStatus('idle'); setKeyTestError(''); }}
                >
                  {AI_PROXY_URL && <option value="proxy">{t('מובנה (ללא מפתח)')}</option>}
                  <option value="gemini">Google Gemini</option>
                  <option value="groq">{t('Groq (חינמי)')}</option>
                  <option value="openrouter">{t('OpenRouter (חינמי)')}</option>
                </select>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem', lineHeight: '1.4' }}>
                  {t('לכל ספק מפתח נפרד. ללא מפתח — נעשה שימוש בברכות תבנית מובנות (חינם, ללא AI).')}
                </p>
              </div>

              {(settings.aiProvider || 'gemini') === 'gemini' && (
                <>
                  <div className="form-group">
                    <label className="form-label" htmlFor="input-api-key"><span>{t('מפתח API של Google Gemini')}</span></label>
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
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem', lineHeight: '1.4' }}>{t('🔒 המפתח נשמר רק במכשיר שלך — הוא לא נשלח לאף שרת חיצוני.')}</p>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="select-gemini-model">{t('מודל Gemini')}</label>
                    <select id="select-gemini-model" className="form-select" value={settings.geminiModel || DEFAULT_GEMINI_MODEL} onChange={(e) => { setLocalSettings({ ...settings, geminiModel: e.target.value }); setKeyTestStatus('idle'); setKeyTestError(''); }}>
                      {GEMINI_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem', lineHeight: '1.4' }}>{t('אם מתקבלת שגיאת מכסה (429 / quota), נסה/י מודל אחר — זמינות המכסה החינמית משתנה לפי חשבון ואזור.')}</p>
                  </div>
                </>
              )}

              {settings.aiProvider === 'groq' && (
                <>
                  <div className="form-group">
                    <label className="form-label" htmlFor="input-groq-key"><span>{t('מפתח API של Groq')}</span></label>
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
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem', lineHeight: '1.4' }}>{t('🔒 המפתח נשמר רק במכשיר שלך. Groq חינמי לחלוטין עם מכסה נדיבה.')}</p>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="select-groq-model">{t('מודל Groq')}</label>
                    <select id="select-groq-model" className="form-select" value={settings.groqModel || DEFAULT_GROQ_MODEL} onChange={(e) => { setLocalSettings({ ...settings, groqModel: e.target.value }); setKeyTestStatus('idle'); setKeyTestError(''); }}>
                      {GROQ_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem', lineHeight: '1.4' }}><strong>gpt-oss-120b</strong> {t('נותן את התוצאות הטובות ביותר בעברית. הדגמים הקטנים חלשים יותר.')}</p>
                  </div>
                </>
              )}

              {settings.aiProvider === 'openrouter' && (
                <>
                  <div className="form-group">
                    <label className="form-label" htmlFor="input-or-key"><span>{t('מפתח API של OpenRouter')}</span></label>
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
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem', lineHeight: '1.4' }}>{t('🔒 המפתח נשמר רק במכשיר שלך. OpenRouter מאפשר שימוש חינמי בדגמי Gemma הפתוחים.')}</p>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="select-or-model">
                      {t('מודל OpenRouter')} {orModelsLoading && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>{t('(טוען רשימה...)')}</span>}
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

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '2rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('ההגדרות נשמרות אוטומטית ✓')}</span>
                {settings.aiProvider !== 'proxy' && (
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
                      <span>{t('בודק...')}</span>
                    </div>
                  ) : (
                    <>
                      <CheckCircle size={16} />
                      <span>{t('בדוק/י מפתח')}</span>
                    </>
                  )}
                </button>
                )}
              </div>

              {keyTestStatus === 'valid' && (
                <div style={{ marginTop: '1rem', color: 'var(--success)', fontWeight: 'bold', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <CheckCircle size={16} />
                  <span>{t('המפתח תקין ופעיל! יצירת ברכות AI מוכנה.')}</span>
                </div>
              )}
              {keyTestStatus === 'invalid' && (
                <div style={{ marginTop: '1rem', color: 'var(--danger, #ff5c5c)', fontWeight: 'bold', fontSize: '0.85rem', lineHeight: '1.4' }}>
                  ❌ {t('המפתח אינו תקין.')} {keyTestError && <span style={{ fontWeight: 400, opacity: 0.85 }}>({keyTestError})</span>}
                </div>
              )}

              {saveStatus === 'success' && (
                <div style={{ marginTop: '1rem', color: 'var(--success)', fontWeight: 'bold', fontSize: '0.9rem', textAlign: 'center' }}>
                  {t('ההגדרות נשמרו!')}
                </div>
              )}
            </form>

            {settings.aiProvider !== 'proxy' && (
            <div style={{ marginTop: '3rem', padding: '1rem', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', background: 'rgba(255,255,255,0.01)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>{t('איך משיגים מפתח API בחינם?')}</h3>
              {(settings.aiProvider || 'gemini') === 'gemini' && (
                <ol style={{ paddingRight: '1.25rem', fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <li>{t('היכנס/י ל-')}<a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" style={{ color: 'var(--secondary)' }}>Google AI Studio</a> {t('והתחבר/י עם חשבון Google.')}</li>
                  <li>{t('לחץ/י על')} <strong>Create API Key</strong>{t(', העתק/י את המפתח והדבק/י אותו כאן.')}</li>
                  <li>{t('אם מתקבלת שגיאת מכסה (429) — נסה/י מודל אחר, או עבור/י ל-Groq / OpenRouter למעלה.')}</li>
                </ol>
              )}
              {settings.aiProvider === 'groq' && (
                <ol style={{ paddingRight: '1.25rem', fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <li>{t('היכנס/י ל-')}<a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" style={{ color: 'var(--secondary)' }}>Groq Console</a> {t('והתחבר/י (חינם, אפשר עם חשבון Google).')}</li>
                  <li>{t('לחץ/י על')} <strong>Create API Key</strong>{t(', העתק/י את המפתח (מתחיל ב-')}<span className="numbers-font">gsk_</span>{t(') והדבק/י אותו כאן.')}</li>
                  <li>{t('לחץ/י "בדוק/י מפתח" כדי לוודא שהכול עובד. Groq חינמי לחלוטין.')}</li>
                </ol>
              )}
              {settings.aiProvider === 'openrouter' && (
                <ol style={{ paddingRight: '1.25rem', fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <li>{t('היכנס/י ל-')}<a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" style={{ color: 'var(--secondary)' }}>OpenRouter</a> {t('והתחבר/י (חינם, אפשר עם חשבון Google).')}</li>
                  <li>{t('לחץ/י על')} <strong>Create Key</strong>{t(', העתק/י את המפתח (מתחיל ב-')}<span className="numbers-font">sk-or-</span>{t(') והדבק/י אותו כאן.')}</li>
                  <li>{t('בחר/י מודל')} <strong>:free</strong> {t('ולחץ/י "בדוק/י מפתח". לדגמים החינמיים יש מגבלת קצב.')}</li>
                </ol>
              )}
            </div>
            )}
          </section>
        )}
      </main>

      {/* Share events modal */}
      {showShareModal && (
        <div className="modal-overlay" style={{ zIndex: 4000 }} onClick={() => setShowShareModal(false)}>
          <div className="glass-card modal-content" style={{ maxWidth: '480px' }} onClick={ev => ev.stopPropagation()}>
            <button type="button" className="icon-btn modal-close-btn" onClick={() => setShowShareModal(false)} title="סגור"><X size={20} /></button>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Share2 size={20} /> <span>{t('שיתוף אירועים')}</span>
            </h3>

            {!shareCode ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>נבחרו {shareSelectedIds.size} מתוך {people.length}</span>
                  <button type="button" className="btn btn-secondary" style={{ width: 'auto', padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                    onClick={() => setShareSelectedIds(shareSelectedIds.size === people.length ? new Set() : new Set(people.map(p => p.id)))}>
                    {shareSelectedIds.size === people.length ? t('נקה הכל') : t('בחר/י הכל')}
                  </button>
                </div>
                <div style={{ maxHeight: '45vh', overflowY: 'auto', margin: '0.5rem 0 1rem' }}>
                  {people.map(p => (
                    <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={shareSelectedIds.has(p.id)} onChange={() => toggleShareId(p.id)} />
                      <span style={{ fontWeight: 600 }}>{getOccasionEmoji(p.occasion)} {p.firstName} {p.lastName || ''}</span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginInlineStart: 'auto' }}>{t(p.occasion)}</span>
                    </label>
                  ))}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.25rem 0 0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={shareIncludeSettings} onChange={(e) => setShareIncludeSettings(e.target.checked)} />
                  <span>{t('כלול הגדרות ומפתחות API (גיבוי מלא — לא לשיתוף עם אחרים)')}</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 0.85rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={shareIncludeDrafts} onChange={(e) => setShareIncludeDrafts(e.target.checked)} />
                  <span>{t('כלול טיוטות ברכה שמורות')}</span>
                </label>
                <button type="button" className="btn btn-primary" onClick={handleGenerateShare} disabled={shareSelectedIds.size === 0}>
                  {t('צור קובץ מוצפן')} ({shareSelectedIds.size})
                </button>
              </>
            ) : (
              <>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', lineHeight: '1.5' }}>
                  {t('הקובץ מוכן. שתף/י אותו, ושלח/י את הקוד')} <strong>{t('בנפרד')}</strong>:
                </p>
                <div style={{ textAlign: 'center', fontSize: '1.8rem', fontWeight: 800, letterSpacing: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '8px', padding: '0.75rem', marginBottom: '1rem', fontFamily: 'var(--font-numbers)' }}>
                  {shareCode}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button type="button" className="btn btn-primary" style={{ flex: 1, minWidth: '160px' }} onClick={handleSendShareFile}>
                    <FileText size={16} /> <span>{Capacitor.isNativePlatform() ? t('שתף/י קובץ גיבוי') : t('הורד/י קובץ גיבוי')}</span>
                  </button>
                  <button type="button" className="icon-btn" title={t('העתק קוד')} onClick={() => navigator.clipboard?.writeText(shareCode)}><Copy size={18} /></button>
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.75rem', lineHeight: '1.5' }}>
                  {Capacitor.isNativePlatform()
                    ? t('שלח/י את הקובץ בוואטסאפ (כמסמך) או במייל. בצד השני פותחים ומייבאים את הקובץ, ומזינים את הקוד.')
                    : t('שמור/י את הקובץ ושלח/י אותו. בצד השני מייבאים את הקובץ ומזינים את הקוד.')}
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Import events modal */}
      {showImportModal && (
        <div className="modal-overlay" style={{ zIndex: 4000 }} onClick={() => setShowImportModal(false)}>
          <div className="glass-card modal-content" style={{ maxWidth: '480px' }} onClick={ev => ev.stopPropagation()}>
            <button type="button" className="icon-btn modal-close-btn" onClick={() => setShowImportModal(false)} title="סגור"><X size={20} /></button>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Import size={20} /> <span>{t('ייבוא אירועים')}</span>
            </h3>

            {importDone > 0 ? (
              <div style={{ textAlign: 'center', padding: '1rem' }}>
                <p style={{ fontSize: '1rem', color: 'var(--success)', fontWeight: 700, marginBottom: '1rem' }}>{t('יובאו')} {importDone} {t('אירועים חדשים')} ✓</p>
                <button type="button" className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowImportModal(false)}>{t('סגור')}</button>
              </div>
            ) : (
              <>
                <label className="btn btn-secondary" style={{ width: 'auto', marginBottom: '0.75rem' }}>
                  <Import size={16} /> <span>{importFileName || t('בחר/י קובץ גיבוי')}</span>
                  <input type="file" style={{ display: 'none' }} onChange={handleImportFilePick} />
                </label>

                <div className="form-group">
                  <label className="form-label" htmlFor="import-code">{t('קוד הפענוח')}</label>
                  <input id="import-code" type="text" className="form-input numbers-font" placeholder={t('6 תווים')} value={importCode}
                    onChange={(e) => setImportCode(e.target.value)} style={{ letterSpacing: '3px', textAlign: 'center' }} />
                </div>

                {importError && <p style={{ color: 'var(--danger, #ff5c5c)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>❌ {importError}</p>}

                {importPreview ? (
                  <>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.5rem 0' }}>{t('נמצאו')} {importPreview.length} {t('אירועים')}:</p>
                    <p style={{ fontSize: '0.82rem', fontWeight: 700, color: importSettings ? 'var(--success)' : 'var(--text-muted)', margin: '0 0 0.5rem' }}>
                      {importSettings ? `✓ ${t('הגיבוי כולל גם הגדרות ומפתחות')}` : t('גיבוי אירועים בלבד (ללא הגדרות)')}
                    </p>
                    <div style={{ maxHeight: '35vh', overflowY: 'auto', marginBottom: '1rem' }}>
                      {importPreview.map((ev, i) => (
                        <div key={i} style={{ padding: '0.4rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.9rem' }}>
                          {getOccasionEmoji(ev.occasion)} {ev.firstName} {ev.lastName || ''} · <span style={{ color: 'var(--text-secondary)' }}>{t(ev.occasion)}</span>
                        </div>
                      ))}
                    </div>
                    {importSettings && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={importRestoreSettings} onChange={(e) => setImportRestoreSettings(e.target.checked)} />
                        <span>{t('שחזר גם הגדרות ומפתחות מהגיבוי')}</span>
                      </label>
                    )}
                    {importHasDrafts && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={importRestoreDrafts} onChange={(e) => setImportRestoreDrafts(e.target.checked)} />
                        <span>{t('שחזר גם טיוטות ברכה מהגיבוי')}</span>
                      </label>
                    )}
                    <button type="button" className="btn btn-primary" onClick={handleConfirmImport}>{t('ייבא/י ומזג/י')}</button>
                  </>
                ) : (
                  <button type="button" className="btn btn-primary" onClick={handleDecryptImport} disabled={!importBlob || !importCode.trim()}>
                    {t('פענח/י ותצוגה מקדימה')}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

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
                    ? t('מחולל ברכות מהיר (על פי דרישה) ⚡')
                    : `${t('ברכה עבור')} ${greetingPerson?.firstName}`}
                </span>
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                {!isQuickMode && greetingPerson && `${t(greetingPerson.relation)} • ${t(greetingPerson.occasion)} (${getCelebrationYears(greetingPerson)} ${t('שנים')})`}
                {isQuickMode && t('יצירת ברכה חכמה ללא שמירה')}
              </p>
            </div>

            {/* Quick Mode Input Fields (Feature 2) */}
            {isQuickMode && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem', padding: '1rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--secondary)', marginBottom: '0.25rem' }}>{t('פרטי מקבל הברכה')}:</h4>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>{t('שם פרטי')}</label>
                    <input
                      type="text"
                      className="form-input"
                      style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                      placeholder={t('ישראל')}
                      value={quickFirstName}
                      onChange={(e) => setQuickFirstName(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>{t('שם משפחה (אופציונלי)')}</label>
                    <input
                      type="text"
                      className="form-input"
                      style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                      placeholder={t('ישראלי')}
                      value={quickLastName}
                      onChange={(e) => setQuickLastName(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 0.8fr', gap: '0.75rem', alignItems: 'end' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>{t('סוג האירוע')}</label>
                    <select
                      className="form-select"
                      style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                      value={quickOccasion}
                      onChange={(e) => setQuickOccasion(e.target.value as any)}
                    >
                      {OCCASIONS.map(o => (
                        <option key={o} value={o}>{t(o)}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>{t('קשר משפחתי/חברתי')}</label>
                    <select
                      className="form-select"
                      style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                      value={quickRelation}
                      onChange={(e) => handleQuickRelationChange(e.target.value)}
                    >
                      {RELATIONS.map(r => (
                        <option key={r} value={r}>{t(r)}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>{t('גיל/שנים')}</label>
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
                      <span>{t('זכר')}</span>
                    </label>
                    <label className="gender-radio-label" style={{ fontSize: '0.8rem' }}>
                      <input
                        type="radio"
                        name="quickGender"
                        className="gender-radio-input"
                        checked={quickGender === 'Female'}
                        onChange={() => setQuickGender('Female')}
                      />
                      <span>{t('נקבה')}</span>
                    </label>
                    <label className="gender-radio-label" style={{ fontSize: '0.8rem' }}>
                      <input
                        type="radio"
                        name="quickGender"
                        className="gender-radio-input"
                        checked={quickGender === 'Couple'}
                        onChange={() => setQuickGender('Couple')}
                      />
                      <span>{t('זוג / רבים')}</span>
                    </label>
                  </div>

                  <label className="gender-radio-label" style={{ fontSize: '0.8rem' }}>
                    <input
                      type="checkbox"
                      checked={quickUseFirstNameOnly}
                      onChange={(e) => setQuickUseFirstNameOnly(e.target.checked)}
                      style={{ width: '15px', height: '15px', accentColor: 'var(--primary)' }}
                    />
                    <span>{t('שם פרטי בלבד בברכה')}</span>
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
                  <span>{t('ייצר ברכה מהירה באמצעות AI')} ✨</span>
                </button>
              </div>
            )}

            {/* Preview Box */}
            <div className={`greeting-preview-box ${isGenerating ? 'loading' : ''}`} id="greeting-preview-box" style={{ minHeight: isQuickMode ? '140px' : '180px' }}>
              {isGenerating ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div className="spinner"></div>
                  <span>{t('מנסח ברכה...')}</span>
                </div>
              ) : (
                <textarea
                  className="greeting-edit-textarea"
                  value={greetingText}
                  onChange={(e) => setGreetingText(e.target.value)}
                  placeholder={t('הברכה תופיע כאן וניתנת לעריכה לפני שליחה. מלא/י את הפרטים ולחץ/י "ייצר ברכה".')}
                  dir={greetingLang === 'en' ? 'ltr' : 'rtl'}
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
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem' }}>{t('התאמת הברכה מחדש')}:</h3>
              
              <div className="greeting-options-grid">
                <div className="form-group">
                  <label className="form-label">{t('שפת הברכה')}</label>
                  <div className="tone-selector-buttons">
                    <button
                      type="button"
                      className={`tone-btn ${greetingLang === 'he' ? 'active' : ''}`}
                      onClick={() => { setGreetingLang('he'); handleRegenerateGreeting(greetingTone, customGreetingDetails, undefined, 'he'); }}
                    >
                      {t('עברית')}
                    </button>
                    <button
                      type="button"
                      className={`tone-btn ${greetingLang === 'en' ? 'active' : ''}`}
                      onClick={() => { setGreetingLang('en'); handleRegenerateGreeting(greetingTone, customGreetingDetails, undefined, 'en'); }}
                    >
                      {t('אנגלית')}
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('סגנון / טון הברכה')}</label>
                  <div className="tone-selector-buttons">
                    <button
                      className={`tone-btn ${greetingTone === 'normal' ? 'active' : ''}`}
                      onClick={() => {
                        setGreetingTone('normal'); setGreetingLang(settings.language || 'he');
                        handleRegenerateGreeting('normal', customGreetingDetails);
                      }}
                    >
                      {t('חם / רגיל')}
                    </button>
                    <button
                      className={`tone-btn ${greetingTone === 'funny' ? 'active' : ''}`}
                      onClick={() => {
                        setGreetingTone('funny');
                        handleRegenerateGreeting('funny', customGreetingDetails);
                      }}
                    >
                      {t('מצחיק')}
                    </button>
                    <button
                      className={`tone-btn ${greetingTone === 'emotional' ? 'active' : ''}`}
                      onClick={() => {
                        setGreetingTone('emotional');
                        handleRegenerateGreeting('emotional', customGreetingDetails);
                      }}
                    >
                      {t('מרגש')}
                    </button>
                    <button
                      className={`tone-btn ${greetingTone === 'short' ? 'active' : ''}`}
                      onClick={() => {
                        setGreetingTone('short');
                        handleRegenerateGreeting('short', customGreetingDetails);
                      }}
                    >
                      {t('קצר')}
                    </button>
                  </div>
                </div>

                {/* Feature 6: Larger text window for custom request (Textarea) */}
                <div className="form-group">
                  <label className="form-label" htmlFor="custom-instruction">{t('הנחיה מיוחדת ל-AI')}</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <textarea
                      id="custom-instruction"
                      rows={3}
                      maxLength={MAX_CUSTOM_INSTRUCTION_LEN}
                      className="form-textarea"
                      style={{ fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}
                      placeholder={t('הוסף בקשה מיוחדת או פרטים לכלול...')}
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
                      {t('עדכן ונסח מחדש באמצעות AI')} 🪄
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
                <span>{copyFeedback ? t('הועתק!') : t('העתק ברכה')}</span>
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
                <span>{t('שלח בוואטסאפ')}</span>
              </button>
            </div>

            {/* Save this greeting as a draft on the event (Feature 1) */}
            {!isQuickMode && greetingPerson && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: '100%', marginTop: '1rem' }}
                onClick={handleSaveEventDraft}
                disabled={isGenerating || !greetingText.trim()}
                id="btn-save-event-draft"
              >
                <Save size={16} />
                <span>{draftFeedback === 'saved' ? t('נשמר!') : t('שמור טיוטה לאירוע')}</span>
              </button>
            )}

            {/* Saved drafts for this event (load as example base / delete — Features 1, 3, 4) */}
            {!isQuickMode && greetingPerson && personDrafts.length > 0 && (
              <div style={{ marginTop: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Bookmark size={16} style={{ color: 'var(--primary)' }} />
                  <span>{t('טיוטות שמורות לאירוע')} ({personDrafts.length})</span>
                </h3>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0 0 0.6rem' }}>
                  {t('טיוטות משמשות גם כדוגמאות סגנון ליצירה הבאה')} ✨
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {personDrafts.map(d => (
                    <div key={d.id} className="glass-card" style={{ padding: '0.6rem 0.75rem', border: '1px solid var(--panel-border)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                        <span className="numbers-font">{new Date(d.createdAt).toLocaleDateString()}</span>
                      </div>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, whiteSpace: 'pre-wrap', maxHeight: '4.5em', overflow: 'hidden', lineHeight: '1.5' }} dir={d.lang === 'en' ? 'ltr' : 'rtl'}>
                        {d.text}
                      </p>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ flex: 1, padding: '0.3rem 0.7rem', fontSize: '0.76rem' }}
                          onClick={() => handleLoadEventDraft(d)}
                        >
                          <Import size={13} />
                          <span>{t('טען טיוטה')}</span>
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          style={{ color: 'var(--danger, #ff5c5c)' }}
                          title={t('מחק טיוטה')}
                          onClick={() => handleDeleteEventDraft(d.id)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!isQuickMode && greetingPerson && !greetingPerson.phone && (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '0.75rem' }}>
                {t('טיפ: הוסף/י מספר טלפון כדי לפתוח שיחת וואטסאפ ישירות.')}
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
              <span>{t('ייבוא מאנשי קשר 📱')}</span>
            </h3>

            {contactsError === 'not-connected' ? (
              <div style={{ textAlign: 'center', padding: '1.5rem 1rem' }}>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: '1.5' }}>
                  {t('כדי לייבא אנשי קשר, התחבר/י לחשבון Google.')}
                </p>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: 'auto', background: '#4285F4' }}
                  onClick={() => handleGoogleLoginFor('contacts')}
                  disabled={isLoggingIn}
                >
                  <LogIn size={16} />
                  <span>{isLoggingIn ? t('מתחבר...') : t('התחבר/י עם Google')}</span>
                </button>
              </div>
            ) : contactsLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem', gap: '0.75rem' }}>
                <div className="spinner"></div>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('טוען אנשי קשר...')}</span>
              </div>
            ) : contactsError ? (
              <div style={{ textAlign: 'center', padding: '1.5rem 1rem' }}>
                <p style={{ fontSize: '0.9rem', color: 'var(--danger, #ff5c5c)', marginBottom: '1rem', lineHeight: '1.5' }}>{contactsError}</p>
                <button type="button" className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => openContactsModal(contactsTarget)}>{t('נסה/י שוב')}</button>
              </div>
            ) : googleContacts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                {t('לא נמצאו אנשי קשר.')}
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
                  {t('בחר/י איש קשר כדי למלא את פרטי האירוע אוטומטית.')}
                </p>
                <div className="search-container" style={{ marginBottom: '0.85rem' }}>
                  <input
                    type="text"
                    className="form-input search-input"
                    placeholder={t('חיפוש לפי שם או טלפון...')}
                    value={contactsSearch}
                    onChange={(e) => setContactsSearch(e.target.value)}
                    autoFocus
                  />
                  <Search className="search-icon" size={18} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '300px', overflowY: 'auto', paddingLeft: '5px' }}>
                  {filtered.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      {t('אין תוצאות עבור')} "{contactsSearch}"
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
                          {t(getGenderLabel(c.gender))}
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
