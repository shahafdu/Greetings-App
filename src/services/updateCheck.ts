// In-app update check. On launch (Android only) we compare the installed build number against
// the latest GitHub Release and, if newer, surface a prompt linking to the download.
//
// The installed build number is the APK versionCode, set by CI to the GitHub run number; the
// release name embeds that same number ("Build N"). While the repo is private the releases API
// returns 404 and this simply no-ops — it activates automatically once the repo is public.

import { Capacitor } from '@capacitor/core';

const REPO = 'shahafdu/Greetings-App';
const TAG = 'android-latest';

export interface UpdateInfo {
  available: boolean;
  url: string;   // the release page to open for download
  label: string; // e.g. "Build 42"
}

export const checkForUpdate = async (): Promise<UpdateInfo | null> => {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { App } = await import('@capacitor/app');
    const info = await App.getInfo();
    const currentBuild = parseInt(info.build || '0', 10);

    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/${TAG}`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return null; // private repo (404) or offline — no-op

    const data = await res.json();
    const m = `${data.name || ''} ${data.body || ''}`.match(/build[\s:#]*?(\d+)/i);
    const latestBuild = m ? parseInt(m[1], 10) : 0;
    const url = data.html_url || `https://github.com/${REPO}/releases`;

    if (latestBuild > currentBuild) {
      return { available: true, url, label: data.name || `Build ${latestBuild}` };
    }
    return { available: false, url, label: '' };
  } catch {
    return null; // never let an update check break the app
  }
};
