import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { twemojiCode, firstEmoji, recolorSvg, renderBrandImage, BRAND_IMAGE_WIDTH, BRAND_IMAGE_HEIGHT } from './brandImage';

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

describe('recolorSvg', () => {
  it('byter varje färg mot appens nyans efter ljushet', () => {
    const svg = '<svg><path fill="#292F33"/><path fill="#F4900C"/><path fill="#FFF"/></svg>';
    expect(recolorSvg(svg, ['#mork', '#mitt', '#ljus'])).toBe('<svg><path fill="#mork"/><path fill="#mitt"/><path fill="#ljus"/></svg>');
  });
});
