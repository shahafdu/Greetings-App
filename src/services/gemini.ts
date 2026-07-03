import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Person, AppSettings } from './storage';
import { calculateYears, DEFAULT_GEMINI_MODEL, DEFAULT_GROQ_MODEL, DEFAULT_OPENROUTER_MODEL } from './storage';

// Helper to determine the greeting name (first name only vs full name)
const getGreetingName = (person: Person): string => {
  if (person.useFirstNameOnly || !person.lastName) {
    return person.firstName;
  }
  return `${person.firstName} ${person.lastName}`;
};

// Resolve sender-perspective slash forms ("מאחל/ת") to the writer's actual gender.
const applySenderGender = (text: string, senderGender: 'Male' | 'Female'): string => {
  const male = senderGender === 'Male';
  return text
    .replace(/מאחל\/ת/g, male ? 'מאחל' : 'מאחלת')
    .replace(/בטוח\/ה/g, male ? 'בטוח' : 'בטוחה');
};

// A fully dynamic fallback template generator that adapts to tone and customDetails
export const generateFallbackGreeting = (
  person: Person,
  tone: string,
  customDetails = '',
  senderGender: 'Male' | 'Female' = 'Male',
  senderName = ''
): string => {
  const years = calculateYears(person.eventDate);
  const name = getGreetingName(person);
  const isFemale = person.gender === 'Female';

  const signature = senderName.trim() ? `\n\nבאהבה,\n${senderName.trim()}` : '';

  // Proxy delivery: the message is addressed to someone else about the celebrant.
  if (person.proxyName && person.proxyName.trim()) {
    const link = person.celebrantRelationToProxy ? ` (${person.celebrantRelationToProxy})` : '';
    let msg = `${person.proxyName.trim()} היקר/ה! 🎉\nמזל טוב לרגל ה${person.occasion} של ${name}${link}! מאחל/ת המון אושר, בריאות ושמחה.`;
    if (customDetails.trim()) msg += `\n\nבנוסף: ${customDetails}`;
    return applySenderGender(msg, senderGender) + signature;
  }

  const congrats = 'מזל טוב!';
  const verbSuffix = isFemale ? 'שתמשיכי' : 'שתמשיך';
  const succeedVerb = isFemale ? 'תצליחי' : 'תצליח';

  let baseGreeting = '';

  switch (person.occasion) {
    case 'יום נישואין':
      if (tone === 'funny') {
        baseGreeting = `יום נישואין שמח ל${name}! 💍
שנים ביחד ועדיין לא אבדתם את השפיות – זה הישג שראוי להערצה! מאחל/ת לכם עוד המון שנים של ויכוחים על מה אוכלים לארוחת ערב ואהבה ענקית שמנצחת הכל.`;
      } else if (tone === 'emotional') {
        baseGreeting = `יום נישואין שמח ל${name} האהובים! ❤️
ביום המיוחד הזה, מרגש לראות את הדרך המופלאה שעברתם יחד. מאחל/ת לכם עוד שנים רבות של חברות אמת, צחוק משותף, חיבוק חם ותמיכה הדדית בכל שלב בחיים.`;
      } else if (tone === 'short') {
        baseGreeting = `יום נישואין שמח ל${name}! 💍❤️ מאחלים לכם אהבה, בריאות ואושר משותף לאורך שנים רבות.`;
      } else {
        baseGreeting = `יום נישואין שמח ל${name}! 💍❤️
מאחל/ת לכם שנים רבות של זוגיות פורחת, שותפות מנצחת והמון שמחה. שתמשיכו להצמיח יחד את הקן המשפחתי המשותף שלכם.`;
      }
      break;

    case 'סיום לימודים':
      if (tone === 'funny') {
        baseGreeting = `מזל טוב ${name}! 🎓
סיימת את הלימודים! עכשיו רשמית מותר לך להתחיל להתלונן על החיים האמיתיים ועל שעות עבודה משרדיות. גאה בך מאוד שהצלחת לשרוד את כל המבחנים האלה!`;
      } else if (tone === 'emotional') {
        baseGreeting = `ברכות חמות ל${name} היקר/ה! 🎓👏
לראות אותך עומד/ת בקו הסיום של הלימודים ממלא את הלב בגאווה. ההתמדה שלך, הלילות הלבנים והרצון להצליח הוכיחו את עצמם. מאחל/ת לך פריצת דרך מדהימה בכל שאיפותיך.`;
      } else if (tone === 'short') {
        baseGreeting = `כל הכבוד ${name} על סיום הלימודים! 🎓 גאים בך ומאחלים לך המון בהצלחה בפרק הבא של החיים.`;
      } else {
        baseGreeting = `ברכות חמות ל${name} על סיום הלימודים! 🎓👏
גאה בך כל כך על ההתמדה וההישג. ${verbSuffix} לפרוס כנפיים, שכל הדלתות ייפתחו בפניך, ושתקצור/תקצרי את פירות ההשקעה בקריירה החדשה.`;
      }
      break;

    case 'קידום בעבודה':
      if (tone === 'funny') {
        baseGreeting = `מזל טוב ${name}! 🚀💼
עם התפקיד החדש מגיעה גם אחריות גדולה... ובעיקר עוד המון ישיבות זום ומיילים שיכולים היו להיות הודעת סלאק. אבל ברצינות, מגיע לך הכי בעולם!`;
      } else if (tone === 'emotional') {
        baseGreeting = `מזל טוב ${name} היקר/ה! 🚀
הקידום הזה הוא עדות להערכה העצומה לכישרון שלך ולעבודה הקשה שלך יום-יום. הלב מתרחב לראות אותך כובש/ת עוד פסגה מקצועית. בטוח/ה שתביא/י לתפקיד את הקסם הייחודי שלך.`;
      } else if (tone === 'short') {
        baseGreeting = `ברכות על התפקיד החדש ${name}! 🚀💼 מאחל/ת לך סיפוק מקצועי והצלחה ענקית.`;
      } else {
        baseGreeting = `ברכות חמות ${name} על הקידום המיוחל לתפקיד החדש! 🚀💼
השאפתנות והמקצועיות שלך מוכיחות את עצמן. מאחל/ת לך אתגרים מעניינים, סיפוק מקצועי והצלחה רבה בהובלת המהלכים הבאים.`;
      }
      break;

    case 'הולדת תינוק/ת':
      if (tone === 'funny') {
        baseGreeting = `מזל טוב ענק ל${name}! 👶🍼
ברוכים הבאים למועדון ההורים הרשמי – המקום שבו קפה חם הוא פנטזיה ולילות רצופים הם זיכרון רחוק. שתזכו לגדל את הקטנ/ה בכיף ובצחוק!`;
      } else if (tone === 'emotional') {
        baseGreeting = `מזל טוב ל${name} היקרים מכל! 👶🍼💝
הולדת התינוק/ת מביאה איתה אור ענק וטהור לעולם. שתזכו להמון רגעים של קסם, של גילויים קטנים ושל חיבור עמוק. מאחל/ת לכם לגדל אותו/אותה בבריאות, שלווה ואהבה אינסופית.`;
      } else if (tone === 'short') {
        baseGreeting = `מזל טוב ל${name} על הרחבת המשפחה! 👶🍼 המון בריאות, נחת ואושר בגידול הקטנ/ה.`;
      } else {
        baseGreeting = `מזל טוב ענק ל${name} על הולדת הבן/בת! 👶🍼
איזה אושר ושמחה גדולה. מאחל/ת לכם גידול קל ומהנה, המון רגעי נחת, בריאות ואהבה בפרק החדש והמרגש של חייכם.`;
      }
      break;

    case 'מעבר דירה':
      if (tone === 'funny') {
        baseGreeting = `בשעה טובה על הדירה החדשה ${name}! 🏠🔑
שיהיו שכנים שקטים, לחץ מים חזק במקלחת, ושתסיימו לפרוק את הארגזים לפני שנת 2030! תתחדשו!`;
      } else if (tone === 'emotional') {
        baseGreeting = `ברכות חמות ל${name} על הכניסה לבית החדש! 🏠🔑✨
בית הוא המקום שבו הלב נמצא, המקום שבו נבנים הזכרונות היפים ביותר. מאחל/ת לכם שהקירות האלו יתמלאו תמיד בצחוק, בשלווה ובאהבה גדולה. תתחדשו!`;
      } else if (tone === 'short') {
        baseGreeting = `בשעה טובה על מעבר הדירה ${name}! 🏠 שיהיה זה בית מלא באור ובשמחה.`;
      } else {
        baseGreeting = `ברכות חמות על המעבר לדירה החדשה, ${name}! 🏠🔑
שיהיה זה בית מלא בשגשוג, שלווה ויישוב טוב. שתזכו להרבה רגעים מאושרים בפינה החדשה שלכם.`;
      }
      break;

    case 'גיוס / שחרור':
      if (tone === 'funny') {
        baseGreeting = `מזל טוב ל${name}! 🎖️
גיוס קל ונעים (תלמד/י לישון בעמידה) או שחרור שמח (סוף סוף מותר להאריך שיער ולישון עד מאוחר)! שיהיה המון בהצלחה בדרך החדשה.`;
      } else if (tone === 'emotional') {
        baseGreeting = `ל${name} היקר/ה! 🎖️
בין אם זהו צעד ראשון ומאתגר במדים או יציאה לחופש האזרחי המיוחל – הדרך הזו מעצבת את מי שאת/ה. גאה בך ומאחל/ת לך לשמור על עצמך, לצמוח מהאתגרים ולהצליח בכל דרך שתבחר/י.`;
      } else if (tone === 'short') {
        baseGreeting = `בהצלחה גדולה בפרק החדש ${name}! 🎖️ שמור/שמרי על עצמך ותהנה/תהני מכל רגע.`;
      } else {
        baseGreeting = `מזל טוב ${name}! 🎖️💪
דרך צלחה בגיוס או בשחרור. מאחל/ת לך שירות משמעותי ומעצים, או חזרה חלקה לאזרחות מלאה בהגשמה ובתוכניות מרתקות.`;
      }
      break;

    case 'חג שמח':
      if (tone === 'funny') {
        baseGreeting = `חג שמח ל${name}! 🍎🍯
מאחל/ת לך חג מלא באוכל מעולה, משפחתיות שמחה ואפס שאלות מביכות מהדודים מסביב לשולחן החג! חג שמח ושנה מתוקה.`;
      } else if (tone === 'emotional') {
        baseGreeting = `חג שמח ל${name} היקר/ה ולמשפחתך! 🍎✨
שהחג הזה יביא איתו שלווה ללב, בריאות איתנה לכולם ושמחה אמיתית בתוך הבית. מאחל/ת לכם שנה של הגשמת חלומות והתחלות מבורכות.`;
      } else if (tone === 'short') {
        baseGreeting = `חג שמח ושנה טובה ל${name}! 🍎🍯 המון בריאות, שמחה והצלחה.`;
      } else {
        baseGreeting = `חג שמח ל${name}! 🍎🍯✨
מאחל/ת לך ולמשפחתך חג מבורך ושמח, מלא באור, בשלווה ובכל טוב.`;
      }
      break;

    case 'יום הולדת':
    default:
      if (tone === 'funny') {
        baseGreeting = `${congrats} ${name}! 🥳🎂
יום הולדת ${years} שמח! אומרים שככל שמזדקנים משתבחים כמו יין... אז במקרה שלך, נראה לי שאת/ה כבר בציר משובח במיוחד! מאחל/ת לך שנה מלאה בצחוק, בריאות, עושר, ושאף פעם לא תצטרך/י לקום מוקדם בבוקר.`;
      } else if (tone === 'emotional') {
        baseGreeting = `${congrats} ${name} היקר/ה! ❤️🎂
ליום הולדתך ה-${years}, אני רוצה לאחל לך את הדברים החשובים באמת: בריאות שלמה, אושר שממלא את הלב מבפנים, ושלווה שמאפשרת ליהנות מכל רגע. תודה על מי שאת/ה ועל האור שאת/ה מביא/ה לחיינו. יום הולדת שמח!`;
      } else if (tone === 'short') {
        baseGreeting = `${congrats} ${name} היקר/ה! 🎂 יום הולדת ${years} שמח! מאחל/ת לך המון בריאות, אושר ושמחה גדולה. ${verbSuffix} ${succeedVerb} בכל דרכייך!`;
      } else {
        baseGreeting = `${congrats} ${name} היקר/ה! 🎂🌟
יום הולדת שמח ומזל טוב לרגל יום הולדתך ה-${years}!
אני רוצה לאחל לך שנה מבורכת בבריאות איתנה, אושר פנימי והצלחה רבה בכל מעשי ידייך. ${verbSuffix} להוות השראה לסובבים אותך!`;
      }
      break;
  }

  // Dynamically incorporate customDetails into the fallback greeting if present
  if (customDetails.trim()) {
    baseGreeting += `\n\nבנוסף, רציתי לאחל לך במיוחד: ${customDetails}`;
  }

  return applySenderGender(baseGreeting, senderGender) + signature;
};

// --- Provider calls (each returns the generated text or throws) ---

const callGemini = async (prompt: string, apiKey: string, model: string): Promise<string> => {
  const genAI = new GoogleGenerativeAI(apiKey);
  const result = await genAI.getGenerativeModel({ model }).generateContent(prompt);
  return (await result.response).text().trim();
};

// Shared helper for OpenAI-compatible chat-completions endpoints (Groq, OpenRouter).
const callOpenAICompatible = async (
  url: string,
  prompt: string,
  apiKey: string,
  model: string,
  extraHeaders: Record<string, string> = {}
): Promise<string> => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, ...extraHeaders },
    body: JSON.stringify({ model, temperature: 0.9, messages: [{ role: 'user', content: prompt }] })
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { detail = (await res.json())?.error?.message || detail; } catch { /* keep status */ }
    throw new Error(detail);
  }
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || '').trim();
};

const callGroq = (prompt: string, apiKey: string, model: string): Promise<string> =>
  callOpenAICompatible('https://api.groq.com/openai/v1/chat/completions', prompt, apiKey, model);

// Built-in AI proxy (a server you host that holds ONE key, so users need no key of their own).
// Set AI_PROXY_URL to your deployed Cloudflare Worker URL to enable the "מובנה (ללא מפתח)" option.
// AI_PROXY_TOKEN is optional (only if you set PROXY_TOKEN on the Worker as an extra gate).
export const AI_PROXY_URL: string = 'https://greetings-ai-proxy.shahafdu-greetings.workers.dev';
const AI_PROXY_TOKEN: string = '';
export const DEFAULT_PROXY_MODEL = 'openai/gpt-oss-120b';

const callProxy = (prompt: string, model: string): Promise<string> =>
  callOpenAICompatible(AI_PROXY_URL, prompt, AI_PROXY_TOKEN, model);

const callOpenRouter = (prompt: string, apiKey: string, model: string): Promise<string> =>
  callOpenAICompatible('https://openrouter.ai/api/v1/chat/completions', prompt, apiKey, model, {
    'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://localhost',
    'X-Title': 'Greetings App'
  });

// Fetch OpenRouter's currently-free models (public endpoint, no key needed). Free models
// have zero prompt+completion pricing. Returns ids with preferred families surfaced first.
export const fetchOpenRouterFreeModels = async (): Promise<string[]> => {
  const res = await fetch('https://openrouter.ai/api/v1/models');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const free = (data.data || [])
    .filter((m: any) => {
      const p = m.pricing || {};
      return Number(p.prompt) === 0 && Number(p.completion) === 0;
    })
    .map((m: any) => m.id as string)
    .filter(Boolean);

  const rank = (id: string): number => {
    if (id.includes('gpt-oss')) return 0;
    if (id.includes('gemma')) return 1;
    if (id.includes('llama')) return 2;
    if (id.includes('mistral') || id.includes('deepseek')) return 3;
    return 5;
  };
  return Array.from(new Set<string>(free)).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
};

// Resolve the active provider, its key and model from settings.
const resolveProvider = (settings: AppSettings) => {
  const provider = settings.aiProvider || 'gemini';
  if (provider === 'proxy') {
    // The proxy holds the key server-side; the "key" here is just the optional proxy token.
    return { provider: 'proxy' as const, key: AI_PROXY_TOKEN, model: DEFAULT_PROXY_MODEL, label: 'מובנה' };
  }
  if (provider === 'groq') {
    return { provider: 'groq' as const, key: (settings.groqApiKey || '').trim(), model: settings.groqModel || DEFAULT_GROQ_MODEL, label: 'Groq' };
  }
  if (provider === 'openrouter') {
    return { provider: 'openrouter' as const, key: (settings.openRouterApiKey || '').trim(), model: settings.openRouterModel || DEFAULT_OPENROUTER_MODEL, label: 'OpenRouter' };
  }
  return {
    provider: 'gemini' as const,
    key: (settings.geminiApiKey || (import.meta.env.VITE_GEMINI_API_KEY as string | undefined) || '').trim(),
    model: settings.geminiModel || DEFAULT_GEMINI_MODEL,
    label: 'Gemini'
  };
};

// Run a prompt against the active provider.
const callProvider = (provider: 'gemini' | 'groq' | 'openrouter' | 'proxy', prompt: string, key: string, model: string): Promise<string> => {
  if (provider === 'proxy') return callProxy(prompt, model);
  if (provider === 'groq') return callGroq(prompt, key, model);
  if (provider === 'openrouter') return callOpenRouter(prompt, key, model);
  return callGemini(prompt, key, model);
};

// Validate the user's API key for the active provider with a minimal real request.
export const testAiApiKey = async (settings: AppSettings): Promise<{ ok: boolean; error?: string }> => {
  const { provider, key, model } = resolveProvider(settings);
  if (provider !== 'proxy' && !key) return { ok: false, error: 'לא הוזן מפתח API.' };
  try {
    await callProvider(provider, 'בדיקה', key, model);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'מפתח לא תקין.';
    return { ok: false, error: message };
  }
};

export interface GreetingResult {
  text: string;
  // Set only when a real Gemini call was attempted but failed; the text then holds the
  // template fallback. Lets the UI tell the user *why* AI generation didn't run.
  error?: string;
}

const genderGrammar = (gender: Person['gender']): string => {
  if (gender === 'Female') return 'נקבה (לכתוב בגוף שני נקבה: את, תהיי, תצליחי וכו\')';
  if (gender === 'Couple') return 'זוג / קבוצה (לכתוב בלשון רבים, פנייה לשני אנשים יחד: אתם, תהיו, שתזכו, מאחל לכם וכו\')';
  return 'זכר (לכתוב בגוף שני זכר: אתה, תהיה, תצליח וכו\')';
};

// Simple English template fallback (used when no AI is available and the greeting language is English).
const englishFallbackGreeting = (person: Person, tone: string, customDetails = '', senderName = ''): string => {
  const years = calculateYears(person.eventDate);
  const name = getGreetingName(person);
  const sig = senderName.trim() ? `\n\nWith love,\n${senderName.trim()}` : '';
  if (person.proxyName && person.proxyName.trim()) {
    const link = person.celebrantRelationToProxy ? ` (${person.celebrantRelationToProxy})` : '';
    let m = `Dear ${person.proxyName.trim()}! 🎉\nCongratulations on the ${person.occasion} of ${name}${link}! Wishing you lots of joy, health and happiness.`;
    if (customDetails.trim()) m += `\n\nAlso: ${customDetails}`;
    return m + sig;
  }
  const map: Record<string, string> = {
    'יום הולדת': `Happy birthday, ${name}! 🎂🎉 Wishing you a year full of health, joy and success${years ? ` — here's to ${years}!` : ''}.`,
    'יום נישואין': `Happy anniversary, ${name}! 💍❤️ Wishing you many more years of love, partnership and happiness.`,
    'סיום לימודים': `Congratulations on your graduation, ${name}! 🎓 So proud of you — wishing you great success ahead.`,
    'קידום בעבודה': `Congrats on the new role, ${name}! 🚀 Wishing you fulfillment and great success.`,
    'הולדת תינוק/ת': `Mazal tov on your new baby, ${name}! 👶🍼 Wishing you health, joy and lots of nachas.`,
    'מעבר דירה': `Congratulations on your new home, ${name}! 🏠🔑 May it be filled with light and happiness.`,
    'חג שמח': `Happy holiday, ${name}! 🍎🍯 Wishing you health, joy and success.`,
  };
  let base = map[person.occasion] || `Congratulations, ${name}, on your ${person.occasion}! 🎉 Wishing you all the best.`;
  if (tone === 'short') base = base.split('\n')[0];
  if (customDetails.trim()) base += `\n\nAlso: ${customDetails}`;
  return base + sig;
};

export const generateHebrewBirthdayGreeting = async (
  person: Person,
  tone: 'normal' | 'funny' | 'emotional' | 'short',
  customDetails: string,
  settings: AppSettings,
  lang: 'he' | 'en' = 'he'
): Promise<GreetingResult> => {
  const senderGender = settings.senderGender || 'Male';
  const senderName = (settings.senderName || '').trim();
  const { provider, key, model, label } = resolveProvider(settings);
  // Language-aware fallback (used whenever real AI is unavailable or fails).
  const fb = (): string => lang === 'en'
    ? englishFallbackGreeting(person, tone, customDetails, senderName)
    : generateFallbackGreeting(person, tone, customDetails, senderGender, senderName);

  // Real AI generation needs either a key (gemini/groq/openrouter) or a configured proxy URL.
  // Without one we use the local template fallback (no error: this is expected).
  const canUseAi = provider === 'proxy' ? !!AI_PROXY_URL : !!key;
  if (!canUseAi) {
    return { text: fb() };
  }

  try {
    const years = calculateYears(person.eventDate);
    const genderHebrew = genderGrammar(person.gender);
    const senderHebrew = senderGender === 'Female' ? 'נקבה' : 'זכר';
    const nameForGreeting = getGreetingName(person);
    const isProxy = !!(person.proxyName && person.proxyName.trim());
    const celebrantGenderWord = person.gender === 'Female' ? 'נקבה' : person.gender === 'Couple' ? 'זוג/רבים' : 'זכר';

    let toneDescription = 'חם ומכבד';
    if (tone === 'funny') toneDescription = 'מצחיק, משעשע והומוריסטי';
    if (tone === 'emotional') toneDescription = 'מרגש מאוד, עמוק ומלא אהבה';
    if (tone === 'short') toneDescription = 'קצר וקולע, מתאים להודעה מהירה';

    // The recipient block differs when the greeting is delivered via a proxy (addressed to
    // someone other than the celebrant — e.g. a parent or a family group).
    const recipientBlock = isProxy
      ? `- אופן השליחה: הברכה נשלחת דרך אדם אחר (פרוקסי). יש לפנות ישירות אל מקבל/ת הברכה ולברך אותו/ה לרגל האירוע של אדם אחר.
- מקבל/ת הברכה (אליו/אליה לפנות בגוף שני): ${person.proxyName!.trim()}
- מגדר מקבל/ת הברכה: ${genderGrammar(person.proxyGender || 'Male')}
- בעל/ת האירוע (האדם שעבורו האירוע, אך לא נמען הברכה): ${nameForGreeting}${person.celebrantRelationToProxy ? ` — ${person.celebrantRelationToProxy} של מקבל/ת הברכה` : ''}
- מגדר בעל/ת האירוע: ${celebrantGenderWord}
- מספר שנים רלוונטי (גיל / שנים): ${years}
- חשוב מאוד: פנה/י ישירות אל ${person.proxyName!.trim()} (בגוף שני, לפי מגדרו/ה) וברך/י אותו/ה לרגל ה${person.occasion} של ${nameForGreeting}. אל תפנה/י אל ${nameForGreeting} בגוף שני.`
      : `- שם מקבל/ת הברכה: ${nameForGreeting}
- מספר שנים רלוונטי (אם יש, כגון גיל או שנות נישואין): ${years}
- מערכת יחסים: ${person.relation}
- מגדר של מקבל/ת הברכה: ${genderHebrew} (חשוב מאוד להקפיד על דקדוק עברי נכון לחלוטין בהתאם למגדר!)`;

    // English greeting: simpler grammar (English needs pronouns, not gendered verbs).
    if (lang === 'en') {
      const g = person.gender === 'Female' ? 'female (she/her)' : person.gender === 'Couple' ? 'a couple/group (they/you-plural)' : 'male (he/him)';
      const toneEn = tone === 'funny' ? 'funny and playful' : tone === 'emotional' ? 'deeply heartfelt and loving' : tone === 'short' ? 'short and punchy, for a quick message' : 'warm and respectful';
      const recipientEn = isProxy
        ? `- Delivery: send the greeting VIA someone else. Address ${person.proxyName!.trim()} directly and congratulate them on the ${person.occasion} of ${nameForGreeting}${person.celebrantRelationToProxy ? ` (their ${person.celebrantRelationToProxy})` : ''}. Do NOT address ${nameForGreeting} directly.`
        : `- Recipient: ${nameForGreeting}\n- Relationship: ${person.relation}\n- Recipient is ${g}`;
      const promptEn = `You are a skilled, creative greeting writer.
Write a warm, personal greeting in ENGLISH for this event:
- Occasion: ${person.occasion}
${recipientEn}
- Relevant number of years (age / anniversary, if any): ${years}
- Tone: ${toneEn}
${person.notes ? `- Extra info about the person (hobbies/traits/context): ${person.notes}` : ''}
${customDetails ? `- Special requests to weave in: ${customDetails}` : ''}
${senderName ? `- Sign it at the end from: ${senderName}` : ''}

Rules:
1. Match the content to the occasion (${person.occasion}).
2. Write directly in natural, flowing English — no preface like "Here is your greeting".
3. Add fitting emojis to make it festive.
4. Output only the greeting itself, clean, with no notes or quotation marks around it.`;
      const textEn = await callProvider(provider, promptEn, key, model);
      if (textEn) return { text: textEn };
      return { text: fb(), error: `${label} returned an empty response. Showing a default greeting.` };
    }

    const prompt = `
אתה כותב ברכות יצירתי ומיומן בעברית.
אנא כתוב ברכה חמה ואישית בעברית לאירוע הבא:
- סוג האירוע: ${person.occasion}
${recipientBlock}
- מגדר של כותב/ת הברכה (השולח/ת): ${senderHebrew}. נסח את פעלי הגוף-ראשון בהתאם — לדוגמה: "מאחל" אם השולח זכר, "מאחלת" אם השולחת נקבה; "אוהב" מול "אוהבת"; "גאה" זהה לשניהם.
- סגנון/טון הברכה: ${toneDescription}
${person.notes ? `- מידע נוסף על האדם (תחביבים/תכונות/הקשר): ${person.notes}` : ''}
${customDetails ? `- בקשות מיוחדות לשילוב בברכה: ${customDetails}` : ''}
${senderName ? `- חתום/חתמי את הברכה בסופה בשם השולח/ת: ${senderName}` : ''}

הנחיות חשובות:
1. התאם את תוכן הברכה במדויק לסוג האירוע (${person.occasion}).
2. כתוב את הברכה ישירות בעברית טבעית, זורמת ויפהפייה.
3. אל תצרף שום הערות שוליים, כותרות, מרכאות חיצוניות או טקסט מקדים כגון "הנה הברכה שלך:". התחל ישירות בברכה עצמה.
4. שלב אימוג'ים מתאימים כדי להפוך את הברכה לחגיגית ומזמינה.
5. הקפד על דקדוק עברי נכון לחלוטין בהתאם לכל המגדרים שצוינו.
6. אל תוסיף הערות כגון "נכתב על ידי בינה מלאכותית" או "ברכת Gemini". הברכה צריכה להיות טהורה ונקייה.
`;

    const text = await callProvider(provider, prompt, key, model);

    if (text) return { text };
    return {
      text: fb(),
      error: `${label} החזיר תשובה ריקה (ייתכן בשל מסנני בטיחות). מוצגת ברכת ברירת מחדל.`
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`${label} Generation Error:`, detail);
    return {
      text: fb(),
      error: `יצירת ה-AI נכשלה (${label}) — מוצגת ברכת ברירת מחדל. פרטים: ${detail}`
    };
  }
};
