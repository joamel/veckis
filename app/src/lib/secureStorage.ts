// Plattformsneutral wrapper kring expo-secure-store.
//
// SecureStore finns inte på web — Expos paket kastar/returnerar undefined där.
// HouseholdContext catch:ade detta som "ingen membership" och routade
// tillbaka användaren till /household/setup direkt efter att backenden
// skapat hushållet. Wrappern faller tillbaka till localStorage på web så
// "active_household_id" + tip-flaggor m.fl. persisterar mellan reloads.
//
// API matchar expo-secure-store så att existerande call-sites kan importera
// härifrån utan ändringar (`import * as SecureStore from '../lib/secureStorage'`).
import { Platform } from 'react-native';
import * as Native from 'expo-secure-store';

const webStore = {
  getItemAsync(key: string): Promise<string | null> {
    try {
      return Promise.resolve(window.localStorage.getItem(key));
    } catch {
      return Promise.resolve(null);
    }
  },
  setItemAsync(key: string, value: string): Promise<void> {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* private mode / quota exceeded — best-effort */
    }
    return Promise.resolve();
  },
  deleteItemAsync(key: string): Promise<void> {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* best-effort */
    }
    return Promise.resolve();
  },
};

const impl = Platform.OS === 'web' ? webStore : Native;

export const getItemAsync = impl.getItemAsync.bind(impl);
export const setItemAsync = impl.setItemAsync.bind(impl);
export const deleteItemAsync = impl.deleteItemAsync.bind(impl);
