// Guardrails for AI usage (Feature 5). The greeting generator can call a shared, key-holding
// proxy, so unbounded calls would let a single client run up cost or abuse the model as a
// general-purpose chatbot. These limits keep usage in the "generate a greeting" lane:
//   1. Client-side rate limiting (per minute / hour / day) on real AI calls.
//   2. A hard cap on the length of free-text the user can inject into the prompt.
//   3. A prompt hardening line so custom instructions can only personalize a greeting.
// None of this is a security boundary a determined attacker can't bypass, but it stops casual
// abuse and accidental runaway loops, and it is the server proxy's job to enforce the real cap.

const USAGE_LOG_KEY = 'birthday_greetings_ai_usage';

// Windowed limits: (max calls, window in ms). The tightest one that trips wins.
const LIMITS: { max: number; windowMs: number; label: string }[] = [
  { max: 10, windowMs: 60 * 1000, label: 'דקה' },
  { max: 60, windowMs: 60 * 60 * 1000, label: 'שעה' },
  { max: 200, windowMs: 24 * 60 * 60 * 1000, label: 'יום' }
];

// The longest window we ever look back over, used to prune the stored log.
const MAX_WINDOW_MS = Math.max(...LIMITS.map(l => l.windowMs));

// Max characters of user free-text (custom instruction / notes) forwarded to the model.
export const MAX_CUSTOM_INSTRUCTION_LEN = 600;

const readLog = (): number[] => {
  try {
    const arr = JSON.parse(localStorage.getItem(USAGE_LOG_KEY) || '[]');
    return Array.isArray(arr) ? arr.filter((n: unknown) => typeof n === 'number') : [];
  } catch {
    return [];
  }
};

const writeLog = (log: number[]): void => {
  try {
    localStorage.setItem(USAGE_LOG_KEY, JSON.stringify(log));
  } catch {
    /* storage full / unavailable — rate limiting is best-effort */
  }
};

export interface RateLimitResult {
  ok: boolean;
  error?: string;
}

// Check whether another real AI generation is allowed right now, without recording it.
export const checkAiRateLimit = (now: number = Date.now()): RateLimitResult => {
  const log = readLog().filter(ts => now - ts < MAX_WINDOW_MS);
  for (const { max, windowMs, label } of LIMITS) {
    const recent = log.filter(ts => now - ts < windowMs).length;
    if (recent >= max) {
      return {
        ok: false,
        error: `הגעת למגבלת השימוש ב-AI (${max} ברכות ל${label}). נסה/י שוב מאוחר יותר. בינתיים מוצגת ברכת ברירת מחדל.`
      };
    }
  }
  return { ok: true };
};

// Record a successful AI generation against the rate limit.
export const recordAiUse = (now: number = Date.now()): void => {
  const log = readLog().filter(ts => now - ts < MAX_WINDOW_MS);
  log.push(now);
  writeLog(log);
};

// Trim any user-supplied free text to the allowed length before it reaches the model.
export const clampUserText = (text: string): string => {
  const t = (text || '').trim();
  return t.length > MAX_CUSTOM_INSTRUCTION_LEN ? t.slice(0, MAX_CUSTOM_INSTRUCTION_LEN) : t;
};
