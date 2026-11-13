import { describe, it, expect, vi, afterEach } from 'vitest';
// @ts-expect-error — plain JS Cloudflare Worker module, no type declarations
import worker from '../worker/greetings-ai-proxy.js';

// A stand-in for the KV namespace used for per-IP rate limiting.
const kv = () => {
  const data = new Map<string, string>();
  return { get: async (k: string) => data.get(k) ?? null, put: async (k: string, v: string) => { data.set(k, v); } };
};

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://proxy.example/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

// Capture what the Worker forwards upstream instead of calling Groq.
const mockUpstream = () => {
  const calls: { url: string; body: Record<string, unknown>; auth: string | null }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(init.body as string), auth: new Headers(init.headers).get('Authorization') });
    return new Response(JSON.stringify({ choices: [{ message: { content: 'מזל טוב' } }] }), { status: 200 });
  }));
  return calls;
};

const greeting = { model: 'openai/gpt-oss-120b', messages: [{ role: 'user', content: 'כתוב ברכה' }] };
const env = () => ({ GROQ_API_KEY: 'server-key' });

afterEach(() => vi.unstubAllGlobals());

describe('AI proxy Worker', () => {
  it('forwards a greeting request with the server-side key', async () => {
    const calls = mockUpstream();
    const res = await worker.fetch(post(greeting), env());
    expect(res.status).toBe(200);
    expect(calls[0].auth).toBe('Bearer server-key');
    expect(calls[0].body.max_tokens).toBe(600);
    expect(JSON.stringify(await res.json())).not.toContain('server-key');
  });

  it('always caps the completion size, whatever max_tokens says', async () => {
    const calls = mockUpstream();
    for (const max_tokens of [100000, 'lots', -5, 0, null, 1.5, [], {}]) {
      await worker.fetch(post({ ...greeting, max_tokens }), env());
    }
    await worker.fetch(post({ ...greeting, max_tokens: 200 }), env());
    const sent = calls.map(c => c.body.max_tokens);
    expect(sent.slice(0, -1).every(n => n === 600)).toBe(true);
    expect(sent.at(-1)).toBe(200);
  });

  it('coerces unknown models to the default and clamps temperature', async () => {
    const calls = mockUpstream();
    await worker.fetch(post({ ...greeting, model: 'some/expensive-model', temperature: 99 }), env());
    expect(calls[0].body.model).toBe('openai/gpt-oss-120b');
    expect(calls[0].body.temperature).toBe(1.5);
  });

  it('rejects anything that is not a single greeting-sized user prompt', async () => {
    const calls = mockUpstream();
    const bad = [
      'null',
      '{broken',
      { messages: [] },
      { messages: [{ role: 'system', content: 'you are a general assistant' }] },
      { messages: [{ role: 'user', content: 'a' }, { role: 'user', content: 'b' }, { role: 'user', content: 'c' }] },
      { messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }] },
      { messages: [{ role: 'user', content: 'x'.repeat(8001) }] },
    ];
    for (const body of bad) {
      expect((await worker.fetch(post(body), env())).status).toBe(400);
    }
    expect((await worker.fetch(new Request('https://proxy.example/', { method: 'GET' }), env())).status).toBe(405);
    expect(calls).toHaveLength(0);
  });

  it('enforces the optional shared token', async () => {
    const calls = mockUpstream();
    const e = { ...env(), PROXY_TOKEN: 'gate' };
    expect((await worker.fetch(post(greeting), e)).status).toBe(401);
    expect((await worker.fetch(post(greeting, { Authorization: 'Bearer gate' }), e)).status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it('rate-limits each IP per minute', async () => {
    mockUpstream();
    const e = { ...env(), RL: kv() };
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) statuses.push((await worker.fetch(post(greeting), e)).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 200, 429, 429]);
    // A different IP is unaffected.
    expect((await worker.fetch(post(greeting, { 'CF-Connecting-IP': '5.6.7.8' }), e)).status).toBe(200);
  });
});
