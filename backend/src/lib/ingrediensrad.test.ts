import { describe, it, expect } from 'vitest';
import { stadaIngrediensrad } from './ingrediensrad';

const rad = (name: string, unit: string | null = null) => stadaIngrediensrad({ name, unit, quantity: 1 });

describe('stadaIngrediensrad', () => {
  it('flyttar en enhet som ligger kvar först i namnet', () => {
    // Från ett riktigt importerat recept.
    expect(rad('g nötfärs alt. vego- bland- kyckling- eller hushållsfärs')).toMatchObject({
      name: 'nötfärs alt. vego- bland- kyckling- eller hushållsfärs',
      unit: 'g',
    });
    expect(rad('dl havregryn')).toMatchObject({ name: 'havregryn', unit: 'dl' });
  });

  it('rör inte namnet när enheten redan är satt', () => {
    expect(rad('paprika', 'st')).toMatchObject({ name: 'paprika', unit: 'st' });
    expect(rad('dl havregryn', 'dl')).toMatchObject({ name: 'dl havregryn', unit: 'dl' });
  });

  it('tar bort en avsnittsrubrik som klistrats ihop med varan', () => {
    expect(rad('tillbehör: gröna ärtor')).toMatchObject({ name: 'gröna ärtor' });
    expect(rad('Till servering: crème fraiche')).toMatchObject({ name: 'crème fraiche' });
    expect(rad('sås: 2 dl grädde')).toMatchObject({ name: '2 dl grädde' });
  });

  it('ger enheten en kanonisk form', () => {
    // "förpackning" och "förp" ska inte bli två enheter i databasen.
    expect(rad('tomatpuré', 'förpackning')).toMatchObject({ unit: 'förp' });
    expect(rad('mjöl', 'gram')).toMatchObject({ unit: 'g' });
    // Källans engelska enhet rörs inte — den behövs för ↔-knappen.
    expect(rad('flour', 'cup')).toMatchObject({ unit: 'cup' });
  });

  it('lämnar korrekta receptrader precis som de står', () => {
    const orörda = [
      'banan, i bitar (ca 150 g skalad vikt)',
      'plommon, urkärnade och skurna i små bitar',
      'valfri sylt eller färska bär, till servering',
      'arla köket lätt crème fraiche paprika & chili',
      'kokt, svalt basmatiris',
      'krossade tomater',
    ];
    for (const n of orörda) expect(rad(n).name).toBe(n);
  });

  it('tar inte ett vanligt ord för en enhet', () => {
    expect(rad('lax utan skinn och ben').name).toBe('lax utan skinn och ben');
    expect(rad('grovt rågmjöl').name).toBe('grovt rågmjöl');
  });

  it('lämnar raden om det bara är en rubrik', () => {
    expect(rad('tillbehör:').name).toBe('tillbehör:');
  });
});
