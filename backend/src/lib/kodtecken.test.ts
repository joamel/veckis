import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Svenska tecken i kod (identifierare som `delaAlternativ`, `skräp`, `åtgärd`)
 * är tillåtna i JavaScript och används redan genom hela projektet. Den enda
 * verkliga risken är att samma bokstav kan skrivas på TVÅ sätt:
 *
 *   "å" = U+00E5                      (sammansatt, NFC — det vi vill ha)
 *   "å" = "a" + U+030A combining ring (dekomponerat, NFD)
 *
 * De ser exakt likadana ut i editorn men är olika strängar. En variabel som
 * deklareras i den ena formen och används i den andra ger "is not defined",
 * och en sökning hittar inte sin egen kod. macOS filsystem och vissa
 * klipp-och-klistra-vägar producerar NFD.
 *
 * Testet låser fast NFC i hela källträdet. Faller det: spara om filen som
 * UTF-8 utan dekomponerade tecken.
 */
const ROT = join(__dirname, '..', '..');
const MAPPAR = ['src', 'scripts', 'prisma'];
const ÄNDELSER = ['.ts', '.tsx', '.mjs', '.prisma', '.json', '.md'];
// Kombinerande diakriter: det som gör ett tecken dekomponerat.
const KOMBINERANDE = /[\u0300-\u036f]/;

function filer(katalog: string): string[] {
  const ut: string[] = [];
  for (const post of readdirSync(katalog)) {
    if (post === 'node_modules' || post === 'dist') continue;
    const sökväg = join(katalog, post);
    if (statSync(sökväg).isDirectory()) ut.push(...filer(sökväg));
    else if (ÄNDELSER.some(ä => post.endsWith(ä))) ut.push(sökväg);
  }
  return ut;
}

describe('källkodens tecken', () => {
  it('innehåller inga dekomponerade å, ä eller ö', () => {
    const träffar: string[] = [];
    for (const mapp of MAPPAR) {
      for (const fil of filer(join(ROT, mapp))) {
        const innehåll = readFileSync(fil, 'utf8');
        if (!KOMBINERANDE.test(innehåll)) continue;
        const rad = innehåll.split('\n').findIndex(r => KOMBINERANDE.test(r)) + 1;
        träffar.push(`${relative(ROT, fil)}:${rad}`);
      }
    }
    expect(träffar).toEqual([]);
  });

  it('är samma sträng i NFC-form — annars fångar testet ovan fel', () => {
    expect('å'.normalize('NFD')).not.toBe('å');
    expect(KOMBINERANDE.test('å'.normalize('NFD'))).toBe(true);
    expect(KOMBINERANDE.test('å')).toBe(false);
  });
});
