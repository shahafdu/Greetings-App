import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Person } from './storage';
import { calculateYears } from './storage';

// Helper to determine the greeting name (first name only vs full name)
const getGreetingName = (person: Person): string => {
  if (person.useFirstNameOnly || !person.lastName) {
    return person.firstName;
  }
  return `${person.firstName} ${person.lastName}`;
};

// A fully dynamic fallback template generator that adapts to tone and customDetails
export const generateFallbackGreeting = (person: Person, tone: string, customDetails = ''): string => {
  const years = calculateYears(person.eventDate);
  const name = getGreetingName(person);
  const isFemale = person.gender === 'Female';
  
  const congrats = 'מזל טוב!';
  const verbSuffix = isFemale ? 'שתמשיכי' : 'שתמשיך';
  const succeedVerb = isFemale ? 'תצליחי' : 'תצליח';
  const wishVerb = isFemale ? 'תגשימי' : 'תגשים';

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

  return baseGreeting;
};

export const generateHebrewBirthdayGreeting = async (
  person: Person,
  tone: 'normal' | 'funny' | 'emotional' | 'short',
  customDetails: string,
  apiKey: string
): Promise<string> => {
  const isMockAuth = localStorage.getItem('birthday_greetings_google_auth_active') === 'true';

  // If no real API key is set and no Google login is mocked, immediately return dynamic fallback
  if (!apiKey && !isMockAuth) {
    return generateFallbackGreeting(person, tone, customDetails);
  }

  const activeKey = apiKey || "MOCK_GOOGLE_AUTH_GEMINI_KEY";

  try {
    // If it's the mock auth key, generate the custom fallback greeting directly to guarantee dynamic changes
    if (activeKey === "MOCK_GOOGLE_AUTH_GEMINI_KEY") {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate minor latency for realistic UX
      return generateFallbackGreeting(person, tone, customDetails);
    }

    const genAI = new GoogleGenerativeAI(activeKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const years = calculateYears(person.eventDate);
    const genderHebrew = person.gender === 'Female' ? 'נקבה (לכתוב בגוף שני נקבה: את, תהיי, תצליחי וכו\')' : 'זכר (לכתוב בגוף שני זכר: אתה, תהיה, תצליח וכו\')';
    const nameForGreeting = getGreetingName(person);
    
    let toneDescription = 'חם ומכבד';
    if (tone === 'funny') toneDescription = 'מצחיק, משעשע והומוריסטי';
    if (tone === 'emotional') toneDescription = 'מרגש מאוד, עמוק ומלא אהבה';
    if (tone === 'short') toneDescription = 'קצר וקולע, מתאים להודעה מהירה';

    const prompt = `
אתה כותב ברכות יצירתי ומיומן בעברית.
אנא כתוב ברכה חמה ואישית בעברית לאירוע הבא:
- סוג האירוע: ${person.occasion}
- שם מקבל/ת הברכה: ${nameForGreeting}
- מספר שנים רלוונטי (אם יש, כגון גיל או שנות נישואין): ${years}
- מערכת יחסים: ${person.relation}
- מגדר של מקבל/ת הברכה: ${genderHebrew} (חשוב מאוד להקפיד על דקדוק עברי נכון לחלוטין בהתאם למגדר!)
- סגנון/טון הברכה: ${toneDescription}
${person.notes ? `- מידע נוסף על האדם (תחביבים/תכונות/הקשר): ${person.notes}` : ''}
${customDetails ? `- בקשות מיוחדות לשילוב בברכה: ${customDetails}` : ''}

הנחיות חשובות:
1. התאם את תוכן הברכה במדויק לסוג האירוע (${person.occasion}). לדוגמה, יום נישואין צריך להיות רומנטי/משפחתי, סיום לימודים צריך להתרכז בהישגים אקדמיים ועתיד מקצועי, קידום בעבודה בהצלחה ניהולית ומקצועיות, הולדת תינוק במשפחה והורות.
2. כתוב את הברכה ישירות בעברית טבעית, זורמת ויפהפייה.
3. אל תצרף שום הערות שוליים, כותרות, מרכאות חיצוניות או טקסט מקדים כגון "הנה הברכה שלך:". התחל ישירות בברכה עצמה.
4. שלב אימוג'ים מתאימים כדי להפוך את הברכה לחגיגית ומזמינה.
5. הקפד על התאמה דקדוקית מלאה למגדר המקבל (${person.gender}).
6. אל תוסיף הערות כגון "נכתב על ידי בינה מלאכותית" או "ברכת Gemini". הברכה צריכה להיות טהורה ונקייה.
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();
    return text || generateFallbackGreeting(person, tone, customDetails);
  } catch (error) {
    console.error('Gemini Generation Error:', error);
    return generateFallbackGreeting(person, tone, customDetails);
  }
};
