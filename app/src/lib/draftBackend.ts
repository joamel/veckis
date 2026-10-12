/**
 * Utkastens lagring på telefonen: en JSON-fil i appens dokumentmapp, som
 * systemet inte rensar (till skillnad från cache-mappen). expo-file-system
 * följer med `expo` själv och finns därför i alla byggen utan egen
 * installation. Webben har sin egen variant (draftBackend.web.ts).
 *
 * Saknas modulen av någon anledning blir backend null — utkasten lever då
 * bara i minnet, som förut.
 */
import { File, Paths } from 'expo-file-system';
import type { DraftBackend } from './drafts';

function createFileBackend(): DraftBackend | null {
  try {
    const file = new File(Paths.document, 'utkast.json');
    return {
      read: () => (file.exists ? file.textSync() : null),
      write: (text: string) => {
        if (!file.exists) file.create();
        file.write(text);
      },
    };
  } catch {
    return null;
  }
}

export const draftBackend: DraftBackend | null = createFileBackend();
