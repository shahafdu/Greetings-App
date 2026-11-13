// In-app update check (Android). Compares the installed build number with the latest GitHub
// Release and, when newer, offers the APK for download.
//
// The installed build number is the APK versionCode, set by CI to the GitHub run number; the
// release name embeds that same number ("Build N"). Runs on every app open (launch + resume)
// and on demand from Settings.

import { Capacitor } from '@capacitor/core';

const REPO = 'shahafdu/Greetings-App';
const TAG = 'android-latest';
const RELEASES_URL = `https://github.com/${REPO}/releases`;
// The only place a download may come from — whatever the API response says.
const DOWNLOAD_PREFIX = `${RELEASES_URL}/download/`;
const REQUEST_TIMEOUT_MS = 15000;

export type UpdateStatus =
  | 'web'          // not the Android app — the web version is always current
  | 'up-to-date'
  | 'available'
  | 'error';       // offline / GitHub unreachable / unexpected response

export interface UpdateInfo {
  status: UpdateStatus;
  available: boolean;
  currentBuild: number | null; // installed versionCode (null on the web / unknown)
  latestBuild: number | null;  // newest published build (null if the check failed)
  url: string;                 // release page
  downloadUrl: string;         // direct APK link (falls back to the release page)
  label: string;               // e.g. "Build 46"
  checkedAt: number;
}

// The installed build number (versionCode), or null on the web.
export const getInstalledBuild = async (): Promise<number | null> => {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { App } = await import('@capacitor/app');
    const build = parseInt((await App.getInfo()).build || '', 10);
    return Number.isFinite(build) ? build : null;
  } catch {
    return null;
  }
};

const result = (over: Partial<UpdateInfo>): UpdateInfo => ({
  status: 'error',
  available: false,
  currentBuild: null,
  latestBuild: null,
  url: RELEASES_URL,
  downloadUrl: RELEASES_URL,
  label: '',
  checkedAt: Date.now(),
  ...over,
});

// Never throws: any failure is reported as status 'error' so an update check can't break the app.
export const checkForUpdate = async (): Promise<UpdateInfo> => {
  if (!Capacitor.isNativePlatform()) return result({ status: 'web' });
  const currentBuild = await getInstalledBuild();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/${TAG}`, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!res.ok) return result({ currentBuild });

    const data = await res.json();
    const name = typeof data?.name === 'string' ? data.name : '';
    const body = typeof data?.body === 'string' ? data.body : '';
    const m = `${name} ${body}`.match(/build[\s:#]*?(\d+)/i);
    const latestBuild = m ? parseInt(m[1], 10) : null;
    if (latestBuild === null) return result({ currentBuild });

    const url = typeof data.html_url === 'string' && data.html_url.startsWith(`${RELEASES_URL}/`)
      ? data.html_url
      : RELEASES_URL;
    const apk = Array.isArray(data.assets)
      ? data.assets.find((a: { name?: unknown; browser_download_url?: unknown }) =>
          typeof a?.name === 'string' && a.name.endsWith('.apk') &&
          typeof a.browser_download_url === 'string' && a.browser_download_url.startsWith(DOWNLOAD_PREFIX))
      : undefined;

    // An unknown installed build (e.g. a local dev build) never claims an update is available.
    const available = currentBuild !== null && latestBuild > currentBuild;
    return result({
      status: available ? 'available' : 'up-to-date',
      available,
      currentBuild,
      latestBuild,
      url,
      downloadUrl: apk ? apk.browser_download_url : url,
      label: (name || `Build ${latestBuild}`).slice(0, 60),
    });
  } catch {
    return result({ currentBuild });
  } finally {
    clearTimeout(timer);
  }
};
