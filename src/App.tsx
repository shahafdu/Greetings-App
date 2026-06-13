import { useState, useEffect } from 'react';
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
  CheckCircle
} from 'lucide-react';

import type { Person, AppSettings } from './services/storage';
import {
  getPeople,
  addPerson,
  updatePerson,
  deletePerson,
  getSettings,
  saveSettings,
  calculateYears,
  getDaysToEvent,
  isEventToday,
  getOccasionEmoji,
  isCloseRelation,
  OCCASIONS,
  RELATIONS
} from './services/storage';

import { generateHebrewBirthdayGreeting } from './services/gemini';

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
];

const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

const MOCK_PHONE_CONTACTS = [
  { firstName: 'דניאל', lastName: 'אביב', phone: '054-9988776', gender: 'Male' as const },
  { firstName: 'רוני', lastName: 'אלבז', phone: '050-8877665', gender: 'Female' as const },
  { firstName: 'עידן', lastName: 'לוי', phone: '052-1122334', gender: 'Male' as const },
  { firstName: 'שרון', lastName: 'מועלם', phone: '053-4433221', gender: 'Female' as const },
  { firstName: 'טל', lastName: 'רפאל', phone: '058-7766554', gender: 'Male' as const }
];

const MOCK_CALENDAR_EVENTS = [
  { firstName: 'אמא ואבא', lastName: '', date: '1990-06-28', occasion: 'יום נישואין' as const, relation: 'הורה', gender: 'Female' as const },
  { firstName: 'עידו', lastName: 'כרמי', date: '2001-07-05', occasion: 'סיום לימודים' as const, relation: 'חבר', gender: 'Male' as const },
  { firstName: 'לירז', lastName: 'שדה', date: '1996-07-12', occasion: 'מעבר דירה' as const, relation: 'קולגה', gender: 'Female' as const },
  { firstName: 'עופר', lastName: 'יונה', date: '1992-06-18', occasion: 'קידום בעבודה' as const, relation: 'חבר קרוב', gender: 'Male' as const }
];

export default function App() {
  // App navigation
  const [activeTab, setActiveTab] = useState<'list' | 'calendar' | 'quick-generate' | 'settings'>('list');
  const [people, setPeople] = useState<Person[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Settings & Google Auth
  const [settings, setLocalSettings] = useState<AppSettings>({
    geminiApiKey: '',
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
  const [formGender, setFormGender] = useState<'Male' | 'Female'>('Male');
  const [formPhone, setFormPhone] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formNotifyDays, setFormNotifyDays] = useState(0);
  const [formNotifyHour, setFormNotifyHour] = useState('09:00');
  const [formIsRecurring, setFormIsRecurring] = useState(true);
  const [formRecurrence, setFormRecurrence] = useState<'yearly' | 'monthly' | 'weekly' | 'once'>('yearly');
  const [formUseFirstNameOnly, setFormUseFirstNameOnly] = useState(true);

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
  const [copyFeedback, setCopyFeedback] = useState(false);

  // On-Demand Quick Generator Mode State (Feature 2)
  const [isQuickMode, setIsQuickMode] = useState(false);
  const [quickFirstName, setQuickFirstName] = useState('');
  const [quickLastName, setQuickLastName] = useState('');
  const [quickOccasion, setQuickOccasion] = useState<Person['occasion']>('יום הולדת');
  const [quickRelation, setQuickRelation] = useState('חבר/ה');
  const [quickGender, setQuickGender] = useState<'Male' | 'Female'>('Male');
  const [quickYears, setQuickYears] = useState(25);
  const [quickUseFirstNameOnly, setQuickUseFirstNameOnly] = useState(true);

  // Contacts picker modal state
  const [showContactsModal, setShowContactsModal] = useState(false);

  // Calendar Sync modal state
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [calendarSyncList, setCalendarSyncList] = useState(MOCK_CALENDAR_EVENTS);

  // Simulated Push Notification toast state
  const [toastNotification, setToastNotification] = useState<{
    show: boolean;
    title: string;
    body: string;
    person: Person;
  } | null>(null);

  // Helper to refresh people list
  const refreshPeopleList = () => {
    setPeople(getPeople());
  };

  // Load initial data
  useEffect(() => {
    refreshPeopleList();
    const saved = getSettings();
    setLocalSettings(saved);
    
    if (localStorage.getItem('birthday_greetings_google_auth_active') === 'true') {
      setLocalSettings(prev => ({
        ...prev,
        useGoogleAuth: true,
        googleUserName: 'ישראל ישראלי',
        googleUserEmail: 'israel.israeli@gmail.com'
      }));
    }

    const timer = setTimeout(() => {
      triggerDemoNotification();
    }, 4000);

    return () => clearTimeout(timer);
  }, []);

  // Play chimes
  const playNotificationSound = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.15);
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.3);
      osc.frequency.setValueAtTime(1046.50, ctx.currentTime + 0.45);
      
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.8);
    } catch (e) {
      console.log('AudioContext could not start', e);
    }
  };

  // Trigger Demo Push Notification
  const triggerDemoNotification = () => {
    const list = getPeople();
    if (list.length === 0) return;
    
    const todayEvent = list.find(p => isEventToday(p)) || list[0];
    
    playNotificationSound();
    setToastNotification({
      show: true,
      title: `התראת דחיפה (Push Notification) 🔔`,
      body: `היום חל אירוע ${todayEvent.occasion} של ${todayEvent.firstName}! לחץ/י כדי להכין ברכה חכמה.`,
      person: todayEvent
    });

    setTimeout(() => {
      setToastNotification(prev => prev ? { ...prev, show: false } : null);
    }, 8000);
  };

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
  const handleGoogleLogin = () => {
    setIsLoggingIn(true);
    setTimeout(() => {
      const updatedSettings = {
        ...settings,
        useGoogleAuth: true,
        googleUserName: 'ישראל ישראלי',
        googleUserEmail: 'israel.israeli@gmail.com'
      };
      setLocalSettings(updatedSettings);
      saveSettings(updatedSettings);
      localStorage.setItem('birthday_greetings_google_auth_active', 'true');
      setIsLoggingIn(false);
    }, 1000);
  };

  // Google Sign-Out
  const handleGoogleLogout = () => {
    const updatedSettings = {
      ...settings,
      useGoogleAuth: false,
      googleUserName: undefined,
      googleUserEmail: undefined
    };
    setLocalSettings(updatedSettings);
    saveSettings(updatedSettings);
    localStorage.removeItem('birthday_greetings_google_auth_active');
  };

  // Settings Save
  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    saveSettings(settings);
    setSaveStatus('success');
    setTimeout(() => setSaveStatus('idle'), 3000);
  };

  // Form Submit (Add / Edit)
  const handleSubmitPerson = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formFirstName.trim() || !formDate) return;

    const personData = {
      firstName: formFirstName,
      lastName: formLastName ? formLastName : undefined,
      eventDate: formDate,
      occasion: formOccasion,
      relation: formRelation,
      gender: formGender,
      phone: formPhone || undefined,
      notes: formNotes || undefined,
      notifyDaysBefore: formNotifyDays,
      notifyHour: formNotifyHour,
      isRecurring: formIsRecurring,
      recurrence: formIsRecurring ? formRecurrence : 'once',
      useFirstNameOnly: formUseFirstNameOnly
    };

    if (editingPerson) {
      updatePerson({ ...personData, id: editingPerson.id });
      setEditingPerson(null);
    } else {
      addPerson(personData);
    }

    // Reset Form
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Generate Greeting Action (Stored Person)
  const handleOpenGreeting = async (person: Person) => {
    setIsQuickMode(false);
    setGreetingPerson(person);
    setGreetingTone('normal');
    setCustomGreetingDetails('');
    setGreetingText('');
    setShowGreetingModal(true);
    setIsGenerating(true);
    
    try {
      const generated = await generateHebrewBirthdayGreeting(person, 'normal', '', settings.geminiApiKey);
      setGreetingText(generated);
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  // Open Quick Generator Modal (On-Demand / Feature 2)
  const handleOpenQuickGenerator = () => {
    setActiveTab("quick-generate");
    setGreetingPerson(null);
    setGreetingText('');
    setGreetingTone('normal');
    setCustomGreetingDetails('');
    
    // Default values
    setQuickFirstName('');
    setQuickLastName('');
    setQuickOccasion('יום הולדת');
    setQuickRelation('חבר/ה');
    setQuickGender('Male');
    setQuickYears(25);
    setQuickUseFirstNameOnly(true);
    
    setShowGreetingModal(true);
  };

  // Trigger on-demand generation inside modal
  const handleGenerateOnDemand = async () => {
    if (!quickFirstName.trim()) {
      alert('נא להזין שם פרטי');
      return;
    }
    
    setIsGenerating(true);
    setGreetingText('');

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
      useFirstNameOnly: quickUseFirstNameOnly
    };

    try {
      const generated = await generateHebrewBirthdayGreeting(
        mockPerson,
        greetingTone,
        customGreetingDetails,
        settings.geminiApiKey
      );
      setGreetingText(generated);
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  // Regenerate/Update Greeting (both modes)
  const handleRegenerateGreeting = async (tone = greetingTone, customText = customGreetingDetails) => {
    if (isQuickMode) {
      // For quick mode, regenerate using the input fields
      if (!quickFirstName.trim()) return;
      setIsGenerating(true);
      const mockBirthYear = new Date().getFullYear() - quickYears;
      const mockPerson: Person = {
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
        useFirstNameOnly: quickUseFirstNameOnly
      };
      try {
        const generated = await generateHebrewBirthdayGreeting(mockPerson, tone, customText, settings.geminiApiKey);
        setGreetingText(generated);
      } catch (err) {
        console.error(err);
      } finally {
        setIsGenerating(false);
      }
    } else {
      // Stored person regeneration
      if (!greetingPerson) return;
      setIsGenerating(true);
      try {
        const generated = await generateHebrewBirthdayGreeting(greetingPerson, tone, customText, settings.geminiApiKey);
        setGreetingText(generated);
      } catch (err) {
        console.error(err);
      } finally {
        setIsGenerating(false);
      }
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

  // Native Contacts Select Simulation
  const handleSelectMockContact = (c: typeof MOCK_PHONE_CONTACTS[0]) => {
    setFormFirstName(c.firstName);
    setFormLastName(c.lastName);
    setFormPhone(c.phone);
    setFormGender(c.gender);
    setShowContactsModal(false);
  };

  // Calendar Sync Simulation
  const handleImportCalendarEvent = (event: typeof MOCK_CALENDAR_EVENTS[0], idx: number) => {
    addPerson({
      firstName: event.firstName,
      lastName: event.lastName || undefined,
      eventDate: event.date,
      occasion: event.occasion,
      relation: event.relation,
      gender: event.gender,
      notifyDaysBefore: 0,
      notifyHour: '09:00',
      isRecurring: ['יום הולדת', 'יום נישואין', 'חג שמח'].includes(event.occasion),
      recurrence: ['יום הולדת', 'יום נישואין', 'חג שמח'].includes(event.occasion) ? 'yearly' : 'once',
      useFirstNameOnly: isCloseRelation(event.relation)
    });
    
    setCalendarSyncList(prev => prev.filter((_, i) => i !== idx));
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
              setFormDate(`${calendarYear - 20}-${formattedMonth}-${formattedDay}`);
              setActiveTab('list');
            }
          }}
        >
          <span className="calendar-day-number">{cell.day}</span>
          <div className="calendar-birthdays-container">
            {cellEvents.map(p => {
              let relationClass = 'friend';
              if (p.relation.includes('זוג') || p.relation.includes('Spouse')) relationClass = 'spouse';
              if (p.relation.includes('אח') || p.relation.includes('אחות') || p.relation.includes('ילד') || p.relation.includes('הורה')) relationClass = 'family';
              
              return (
                <div key={p.id} className={`calendar-birthday-dot ${relationClass}`} title={`${p.firstName} (${p.occasion} - ${p.relation})`}>
                  {getOccasionEmoji(p.occasion)} {p.firstName}
                </div>
              );
            })}
          </div>
        </div>
      );
    });
  };

  return (
    <div className="app-container">
      {/* Simulated Push Notification Banner */}
      {toastNotification && toastNotification.show && (
        <div 
          style={{
            position: 'fixed',
            top: '20px',
            left: '20px',
            right: '20px',
            zIndex: 9999,
            maxWidth: '450px',
            margin: '0 auto',
            border: '2px solid var(--primary)',
            background: '#13112a',
            borderRadius: '16px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.8), 0 0 20px var(--primary-glow)',
            animation: 'modal-enter 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
          }}
          className="glass-card section-panel"
        >
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
            <div style={{ background: 'var(--primary-glow)', padding: '0.5rem', borderRadius: '10px', color: 'var(--primary)' }}>
              <Bell size={24} style={{ animation: 'float 2s infinite' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                <h4 style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{toastNotification.title}</h4>
                <button 
                  onClick={() => setToastNotification(prev => prev ? { ...prev, show: false } : null)}
                  className="icon-btn"
                  style={{ padding: '0.2rem' }}
                >
                  <X size={14} />
                </button>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', lineHeight: '1.4' }}>
                {toastNotification.body}
              </p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => {
                    setToastNotification(prev => prev ? { ...prev, show: false } : null);
                    handleOpenGreeting(toastNotification.person);
                  }}
                  className="btn btn-primary"
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', width: 'auto' }}
                >
                  <Sparkles size={12} />
                  <span>הכן ברכה כעת</span>
                </button>
                <button
                  onClick={() => setToastNotification(prev => prev ? { ...prev, show: false } : null)}
                  className="btn btn-secondary"
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', width: 'auto' }}
                >
                  התעלם
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Header */}
      <header className="app-header glass-card">
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
            onClick={() => setActiveTab("quick-generate")}
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
              <h2 className="form-title" id="form-heading">
                {editingPerson ? <Edit size={20} /> : <Plus size={20} />}
                <span>{editingPerson ? 'עריכת אירוע' : 'הוספת אירוע'}</span>
              </h2>

              <form onSubmit={handleSubmitPerson}>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowContactsModal(true)}
                    style={{ fontSize: '0.8rem', padding: '0.5rem 0.75rem' }}
                  >
                    <Import size={14} />
                    <span>ייבוא מאנשי קשר 📱</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowCalendarModal(true)}
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
                    value={formOccasion}
                    onChange={(e) => setFormOccasion(e.target.value as Person['occasion'])}
                  >
                    {OCCASIONS.map(o => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
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
                    value={formRelation}
                    onChange={(e) => handleRelationChange(e.target.value)}
                  >
                    {RELATIONS.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
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
                  </div>
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
                      onClick={() => {
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
                      }}
                    >
                      ביטול
                    </button>
                  )}
                </div>
              </form>
            </section>

            {/* List Section */}
            <section className="glass-card section-panel" id="contacts-list-section">
              <div className="panel-header">
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>לוח אירועים מתוכננים</h2>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <button 
                    onClick={triggerDemoNotification}
                    className="btn btn-secondary"
                    style={{ padding: '0.45rem 0.8rem', fontSize: '0.8rem', width: 'auto' }}
                    title="בדוק סימולציית התראות דחיפה"
                  >
                    <Bell size={12} />
                    <span>התראה 🔔</span>
                  </button>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }} className="numbers-font">
                    {filteredPeople.length} מתוך {people.length}
                  </div>
                </div>
              </div>

              <div className="search-container">
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

                  let relationClass = 'friend';
                  if (person.relation.includes('זוג') || person.relation.includes('Spouse')) relationClass = 'spouse';
                  if (person.relation.includes('אח') || person.relation.includes('אחות') || person.relation.includes('ילד') || person.relation.includes('הורה')) relationClass = 'family';

                  return (
                    <div key={person.id} className={`person-card glass-card ${relationClass}`}>
                      <div className="person-card-header">
                        <div className="person-name">
                          <span style={{ fontSize: '1.2rem', marginRight: '2px' }}>{getOccasionEmoji(person.occasion)}</span>
                          <span>{person.firstName} {person.lastName || ''}</span>
                          <span className={`gender-badge ${person.gender === 'Female' ? 'female' : 'male'}`}>
                            {person.gender === 'Female' ? 'נקבה' : 'זכר'}
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
                          <span className="numbers-font">{person.phone}</span>
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
              <h4 style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--secondary)', marginBottom: '0.25rem' }}>פרטי מקבל הברכה:</h4>
              
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
                <span>ייצר ברכה מהירה ב-Gemini ✨</span>
              </button>
            </div>

            {/* Preview Box */}
            <div className={`greeting-preview-box ${isGenerating ? 'loading' : ''}`} id="greeting-preview-box" style={{ minHeight: '180px', marginBottom: '1.5rem' }}>
              {isGenerating ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div className="spinner"></div>
                  <span>מנסח ברכה בעברית באמצעות Gemini AI...</span>
                </div>
              ) : greetingText ? (
                greetingText
              ) : (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                  מלא את הפרטים למעלה ולחץ על "ייצר ברכה"
                </div>
              )}
            </div>

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
                      עדכן ונסח מחדש ב-Gemini 🪄
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
                במקום להזין מפתח API ידנית, מומלץ להתחבר באופן בטוח באמצעות חשבון הגוגל שלך. האפליקציה תשתמש בחיבור הגוגל שלך לניהול ברכות Gemini בבטחה.
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

            <form onSubmit={handleSaveSettings}>
              <div className="form-group" style={{ opacity: settings.useGoogleAuth ? 0.4 : 1, pointerEvents: settings.useGoogleAuth ? 'none' : 'auto' }}>
                <label className="form-label" htmlFor="input-api-key">
                  <span>מפתח API של Google Gemini</span>
                  {settings.useGoogleAuth && <span style={{ marginRight: '8px', color: 'var(--success)' }}>(מושבת - חיבור גוגל פעיל)</span>}
                </label>
                <div className="api-key-input-container">
                  <input
                    id="input-api-key"
                    type={showApiKey ? 'text' : 'password'}
                    className="form-input numbers-font"
                    placeholder="AIzaSy..."
                    style={{ paddingLeft: '3rem' }}
                    value={settings.geminiApiKey}
                    onChange={(e) => setLocalSettings({ ...settings, geminiApiKey: e.target.value })}
                    disabled={settings.useGoogleAuth}
                  />
                  <button
                    type="button"
                    className="api-key-toggle-btn"
                    onClick={() => setShowApiKey(!showApiKey)}
                    disabled={settings.useGoogleAuth}
                  >
                    {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div style={{ marginTop: '2rem' }}>
                <button type="submit" className="btn btn-primary" id="btn-save-settings">
                  שמור הגדרות
                </button>
              </div>

              {saveStatus === 'success' && (
                <div style={{ marginTop: '1rem', color: 'var(--success)', fontWeight: 'bold', fontSize: '0.9rem', textAlign: 'center' }}>
                  ההגדרות נשמרו בהצלחה!
                </div>
              )}
            </form>

            <div style={{ marginTop: '3rem', padding: '1rem', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', background: 'rgba(255,255,255,0.01)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>איך משיגים מפתח API בחינם?</h3>
              <ol style={{ paddingRight: '1.25rem', fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <li>כנס לאתר <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" style={{ color: 'var(--secondary)' }}>Google AI Studio</a> והתחבר עם חשבון הגוגל שלך.</li>
                <li>לחץ על הכפתור <strong>Get API Key</strong> בפינה העליונה.</li>
                <li>לחץ על <strong>Create API Key</strong>, העתק את המפתח שנוצר והדבק אותו כאן.</li>
              </ol>
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
                  <span>ייצר ברכה מהירה ב-Gemini ✨</span>
                </button>
              </div>
            )}

            {/* Preview Box */}
            <div className={`greeting-preview-box ${isGenerating ? 'loading' : ''}`} id="greeting-preview-box" style={{ minHeight: isQuickMode ? '140px' : '180px' }}>
              {isGenerating ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div className="spinner"></div>
                  <span>מנסח ברכה בעברית באמצעות Gemini AI...</span>
                </div>
              ) : greetingText ? (
                greetingText
              ) : (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                  מלא את הפרטים למעלה ולחץ על "ייצר ברכה"
                </div>
              )}
            </div>

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
                      עדכן ונסח מחדש ב-Gemini 🪄
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

      {/* Simulated Contacts Picker Modal */}
      {showContactsModal && (
        <div className="modal-overlay" style={{ zIndex: 5000 }}>
          <div className="modal-content glass-card" style={{ maxWidth: '400px' }}>
            <button
              onClick={() => setShowContactsModal(false)}
              className="icon-btn modal-close-btn"
              title="סגור"
            >
              <X size={20} />
            </button>

            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--secondary)' }}>
              <Users size={20} />
              <span>בחירת איש קשר מספר הטלפון 📱</span>
            </h3>
            
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: '1.4' }}>
              הדמיית מגע עם ספר הטלפון הנייטיב של המכשיר. באנדרואיד, כפתור זה מתחבר לספר הטלפונים האמיתי שלך ומאחזר שמות ומספרים.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {MOCK_PHONE_CONTACTS.map((c, idx) => (
                <div
                  key={idx}
                  onClick={() => handleSelectMockContact(c)}
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
                    <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{c.firstName} {c.lastName}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }} className="numbers-font">{c.phone}</div>
                  </div>
                  <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.4rem', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}>
                    {c.gender === 'Female' ? 'נקבה' : 'זכר'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Simulated Calendar Sync Modal */}
      {showCalendarModal && (
        <div className="modal-overlay" style={{ zIndex: 5000 }}>
          <div className="modal-content glass-card" style={{ maxWidth: '500px' }}>
            <button
              onClick={() => setShowCalendarModal(false)}
              className="icon-btn modal-close-btn"
              title="סגור"
            >
              <X size={20} />
            </button>

            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)' }}>
              <CalendarIcon size={20} />
              <span>סנכרון אירועים מיומן ה-Google / טלפון 📅</span>
            </h3>
            
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: '1.4' }}>
              זיהינו אירועים מיוחדים וימי הולדת ביומן שלך. לחץ/י על "ייבוא" כדי להוסיף אותם לרשימת האירועים והברכות המתוכננים שלך.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '300px', overflowY: 'auto', paddingLeft: '5px' }}>
              {calendarSyncList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  כל האירועים סונכרנו בהצלחה! 🎉
                </div>
              ) : (
                calendarSyncList.map((e, idx) => (
                  <div
                    key={idx}
                    className="glass-card"
                    style={{
                      padding: '0.75rem 1rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      border: '1px solid var(--panel-border)'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontSize: '1.1rem' }}>{getOccasionEmoji(e.occasion)}</span>
                        <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{e.firstName} {e.lastName}</span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        סוג: {e.occasion} • תאריך: <span className="numbers-font">{e.date.split('-').reverse().join('/')}</span>
                      </div>
                    </div>
                    
                    <button
                      type="button"
                      onClick={() => handleImportCalendarEvent(e, idx)}
                      className="btn btn-primary"
                      style={{ width: 'auto', padding: '0.35rem 0.8rem', fontSize: '0.8rem' }}
                    >
                      <Import size={12} />
                      <span>ייבוא</span>
                    </button>
                  </div>
                ))
              )}
            </div>

            <div style={{ marginTop: '1.5rem', textAlign: 'left' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowCalendarModal(false)}
                style={{ width: 'auto' }}
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
