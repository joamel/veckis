import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { twemojiCode, firstEmoji, outlineSvg, renderBrandImage, BRAND_IMAGE_WIDTH, BRAND_IMAGE_HEIGHT } from './brandImage';

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

describe('renderBrandImage', () => {
  it('bygger en bild i rätt storlek, med och utan symbol', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><circle cx="18" cy="18" r="16" fill="#f4900c"/></svg>';
    for (const emojiSvg of [svg, null]) {
      const buf = await renderBrandImage({ title: 'Frasiga våfflor med grädde & sylt <3', emojiSvg });
      const m = await sharp(buf).metadata();
      expect([m.width, m.height, m.format]).toEqual([BRAND_IMAGE_WIDTH, BRAND_IMAGE_HEIGHT, 'jpeg']);
    }
  });
});

describe('outlineSvg', () => {
  it('ritar varje fylld form som en kontur i en färg', () => {
    const out = outlineSvg('<svg><path fill="#F4900C"/><path fill="#FFF"/></svg>', '#b1c29e');
    expect(out).not.toMatch(/fill="#/);
    expect(out.match(/stroke="#b1c29e"/g)).toHaveLength(2);
  });
});
