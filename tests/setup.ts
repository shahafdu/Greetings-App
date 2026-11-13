import { beforeEach, vi } from 'vitest';

// Run west of UTC on purpose: `new Date('YYYY-MM-DD')` is UTC midnight, i.e. the PREVIOUS day
// there, so any date parsed that way shows up as an off-by-one failure in these tests.
process.env.TZ = 'America/Los_Angeles';

// Minimal in-memory localStorage (the app's only persistence layer).
class MemoryStorage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
  getItem(k: string) { return this.data.has(k) ? this.data.get(k)! : null; }
  setItem(k: string, v: string) { this.data.set(k, String(v)); }
  removeItem(k: string) { this.data.delete(k); }
  clear() { this.data.clear(); }
}
// Assigned directly (not vi.stubGlobal) so a test's vi.unstubAllGlobals() can't remove it.
(globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();

beforeEach(() => {
  localStorage.clear();
  vi.resetModules(); // fresh in-memory caches, like a cold app start
  vi.useRealTimers();
});
