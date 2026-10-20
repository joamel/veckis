import { describe, it, expect } from 'vitest';
import { twemojiCode, firstEmoji, outlineSvg } from './twemoji';

describe('twemojiCode', () => {
  it('tar bort FE0F utanför ZWJ-sekvenser', () => {
    expect(twemojiCode('🍽️')).toBe('1f37d');
    expect(twemojiCode('🧇')).toBe('1f9c7');
  });
});

describe('firstEmoji', () => {
  it('hittar emojin i ett svar med text runt', () => {
    expect(firstEmoji('Här: 🌮 passar bra')).toBe('🌮');
    expect(firstEmoji('ingen emoji')).toBeNull();
  });
});

describe('outlineSvg', () => {
  it('ritar varje fylld form som en kontur i en färg', () => {
    const out = outlineSvg('<svg><path fill="#F4900C"/><path fill="#FFF"/></svg>', '#b1c29e');
    expect(out).not.toMatch(/fill="#/);
    expect(out.match(/stroke="#b1c29e"/g)).toHaveLength(2);
  });
});
