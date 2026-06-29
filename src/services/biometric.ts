// Biometric unlock for the App Lock (Android fingerprint/face via Keystore-backed storage).
//
// Layers on top of the existing passphrase vault without changing the crypto: the passphrase
// is stored in the device Keystore behind biometric auth. To unlock, the user authenticates
// with their fingerprint, we retrieve the passphrase, and feed it to the normal vault unlock.
// The typed passphrase always remains available as a fallback.

import { Capacitor } from '@capacitor/core';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';

const SERVER = 'com.shahaf.greetings.vault';
const FLAG = 'birthday_greetings_biometric';

export const isBiometricEnabled = (): boolean => localStorage.getItem(FLAG) === 'true';

// Whether the device has usable biometric hardware (native only).
export const isBiometricSupported = async (): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const result = await NativeBiometric.isAvailable();
    return !!result.isAvailable;
  } catch {
    return false;
  }
};

// Store the passphrase behind biometrics and mark biometric unlock as enabled.
export const enableBiometric = async (passphrase: string): Promise<void> => {
  await NativeBiometric.setCredentials({ username: 'vault', password: passphrase, server: SERVER });
  localStorage.setItem(FLAG, 'true');
};

export const disableBiometric = async (): Promise<void> => {
  try {
    await NativeBiometric.deleteCredentials({ server: SERVER });
  } catch {
    /* nothing stored — ignore */
  }
  localStorage.removeItem(FLAG);
};

// Prompt for biometric auth and return the stored passphrase, or null if it failed/cancelled.
export const biometricGetPassphrase = async (): Promise<string | null> => {
  try {
    await NativeBiometric.verifyIdentity({ reason: 'פתיחת הנתונים המוצפנים', title: 'אימות ביומטרי' });
    const cred = await NativeBiometric.getCredentials({ server: SERVER });
    return cred.password || null;
  } catch {
    return null;
  }
};
