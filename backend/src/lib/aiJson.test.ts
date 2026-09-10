import { describe, it, expect } from 'vitest';
import { tolkaJsonSvar, saknarReceptinnehåll, InteJsonError, textUr } from './aiJson';

describe('tolkaJsonSvar', () => {
  it('ren JSON', () => {
    expect(tolkaJsonSvar('{"title":"Pannkakor"}')).toEqual({ title: 'Pannkakor' });
  });

  it('JSON i ett kodblock', () => {
    expect(tolkaJsonSvar('```json\n{"title":"Pannkakor"}\n```')).toEqual({ title: 'Pannkakor' });
  });

  it('prosa FÖRE kodblocket — det var det här som gav "Unexpected token `"', () => {
    const svar = 'Jag kan tyvärr inte se något recept i bilden, men här är strukturen:\n\n```json\n{"title":null,"ingredients":[]}\n```';
    expect(tolkaJsonSvar(svar)).toEqual({ title: null, ingredients: [] });
  });

  it('efterföljande förklaring efter JSON:en', () => {
    expect(tolkaJsonSvar('{"title":"X"}\n\nHoppas det hjälper!')).toEqual({ title: 'X' });
  });

  it('ren prosa utan JSON kastar InteJsonError', () => {
    expect(() => tolkaJsonSvar('Bilden visar en katt, inte ett recept.')).toThrow(InteJsonError);
  });

  it('trasig JSON kastar InteJsonError, inte SyntaxError', () => {
    expect(() => tolkaJsonSvar('{"title": }')).toThrow(InteJsonError);
  });

  it('tomt svar kastar InteJsonError', () => {
    expect(() => tolkaJsonSvar('   ')).toThrow(InteJsonError);
  });
});

describe('saknarReceptinnehåll', () => {
  it('varken ingredienser eller steg = inget recept', () => {
    expect(saknarReceptinnehåll({ ingredients: [], instructions: null })).toBe(true);
  });

  it('bara ingredienser räcker', () => {
    expect(saknarReceptinnehåll({ ingredients: [{ name: 'Mjöl' }], instructions: null })).toBe(false);
  });

  it('bara tillagning räcker', () => {
    expect(saknarReceptinnehåll({ ingredients: [], instructions: '1. Stek' })).toBe(false);
  });

  it('ingredienser med tomma namn räknas inte', () => {
    expect(saknarReceptinnehåll({ ingredients: [{ name: '   ' }], instructions: '' })).toBe(true);
  });

  it('saknade fält helt', () => {
    expect(saknarReceptinnehåll({})).toBe(true);
  });
});

describe('textUr', () => {
  it('plockar texten när den ligger först', () => {
    expect(textUr({ content: [{ type: 'text', text: '{"a":1}' }] })).toBe('{"a":1}');
  });

  it('hoppar över thinking-block — Opus 5 lägger ett sådant först', () => {
    expect(textUr({ content: [{ type: 'thinking' }, { type: 'text', text: 'svaret' }] })).toBe('svaret');
  });

  it('tomt content ger tom sträng i stället för att kasta', () => {
    expect(textUr({ content: [] })).toBe('');
  });

  it('inget textblock alls ger tom sträng', () => {
    expect(textUr({ content: [{ type: 'thinking' }] })).toBe('');
  });

  it('trimmar', () => {
    expect(textUr({ content: [{ type: 'text', text: '  x  ' }] })).toBe('x');
  });
});
