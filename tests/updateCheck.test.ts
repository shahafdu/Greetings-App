import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Pretend to be the Android app with a given installed build.
const native = { value: true };
const installed = { build: '40' };
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.value } }));
vi.mock('@capacitor/app', () => ({ App: { getInfo: async () => ({ build: installed.build }) } }));

const APK = 'https://github.com/shahafdu/Greetings-App/releases/download/android-latest/greetings.apk';
const release = (over: Record<string, unknown> = {}) => ({
  name: 'Build 46',
  body: 'Signed release APK · build 46',
  html_url: 'https://github.com/shahafdu/Greetings-App/releases/tag/android-latest',
  assets: [{ name: 'greetings.apk', browser_download_url: APK }],
  ...over,
});
const github = (body: unknown, status = 200) =>
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })));

const load = async () => (await import('../src/services/updateCheck')).checkForUpdate();

beforeEach(() => { native.value = true; installed.build = '40'; });
afterEach(() => vi.unstubAllGlobals());

describe('update check', () => {
  it('offers the APK when a newer build is published, with both build numbers', async () => {
    github(release());
    const info = await load();
    expect(info).toMatchObject({ status: 'available', available: true, currentBuild: 40, latestBuild: 46, downloadUrl: APK, label: 'Build 46' });
  });

  it('reports up to date when the installed build is the latest (or newer)', async () => {
    for (const build of ['46', '47']) {
      installed.build = build;
      github(release());
      expect(await load()).toMatchObject({ status: 'up-to-date', available: false, latestBuild: 46 });
    }
  });

  it('never offers an update when the installed build is unknown', async () => {
    installed.build = '';
    github(release());
    expect(await load()).toMatchObject({ available: false, currentBuild: null, latestBuild: 46 });
  });

  it('reports an error (never throws) when GitHub is unreachable or answers oddly', async () => {
    github({}, 500);
    expect(await load()).toMatchObject({ status: 'error', available: false, currentBuild: 40 });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    expect(await load()).toMatchObject({ status: 'error', available: false });
    github({ name: 'no number here', body: '' });
    expect(await load()).toMatchObject({ status: 'error', latestBuild: null });
  });

  it('only links to this repo — a foreign download or page URL is ignored', async () => {
    github(release({
      html_url: 'https://evil.example/fake',
      assets: [{ name: 'greetings.apk', browser_download_url: 'https://evil.example/greetings.apk' }],
    }));
    const info = await load();
    expect(info.url).toBe('https://github.com/shahafdu/Greetings-App/releases');
    expect(info.downloadUrl).toBe('https://github.com/shahafdu/Greetings-App/releases');
  });

  it('does nothing on the web', async () => {
    native.value = false;
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await load()).toMatchObject({ status: 'web', available: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
