/**
 * Utkastens lagring i webbläsaren: localStorage. Kan saknas (privat läge,
 * blockerad lagring) — då lever utkasten bara i minnet, som förut.
 */
import type { DraftBackend } from './drafts';

const KEY = 'handlis-utkast';

function createLocalStorageBackend(): DraftBackend | null {
  try {
    const ls = window.localStorage;
    ls.getItem(KEY); // kastar om lagringen är blockerad
    return {
      read: () => ls.getItem(KEY),
      write: (text: string) => ls.setItem(KEY, text),
    };
  } catch {
    return null;
  }
}

export const draftBackend: DraftBackend | null = createLocalStorageBackend();
