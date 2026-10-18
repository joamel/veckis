import { describe, it, expect } from 'vitest';
import { extractMetaText, isInstagramUrl } from './pageMeta';

describe('isInstagramUrl', () => {
  it('känner igen inlägg, reels och kortlänkar', () => {
    expect(isInstagramUrl('https://www.instagram.com/p/ABC123xyz/')).toBe(true);
    expect(isInstagramUrl('https://instagram.com/reel/ABC123xyz/?igsh=xyz')).toBe(true);
    expect(isInstagramUrl('https://instagr.am/p/ABC/')).toBe(true);
  });
  it('släpper igenom vanliga receptsajter och skräp', () => {
    expect(isInstagramUrl('https://www.ica.se/recept/pannkakor-1234/')).toBe(false);
    expect(isInstagramUrl('https://notinstagram.com/p/x')).toBe(false);
    expect(isInstagramUrl('inte en länk')).toBe(false);
  });
});

describe('extractMetaText', () => {
  it('plockar bildtexten ur Instagrams metataggar och avkodar entiteter', () => {
    const html = `<head>
      <meta property="og:title" content="Anna (&#064;annaslagar) &#x2022; Instagram" />
      <meta property="og:description" content="120 likes - annaslagar: &quot;Pannkakor&#10;3 dl vetemjöl&#10;6 dl mjölk&#10;3 ägg&quot;" />
      <meta name="description" content="120 likes - annaslagar: &quot;Pannkakor&#10;3 dl vetemjöl&#10;6 dl mjölk&#10;3 ägg&quot;" />
      <meta property="og:image" content="https://cdn/x.jpg" />
    </head>`;
    const text = extractMetaText(html);
    expect(text).toContain('Anna (@annaslagar) • Instagram');
    expect(text).toContain('3 dl vetemjöl\n6 dl mjölk');
    // og:description och description är identiska — bara en gång.
    expect(text.match(/vetemjöl/g)).toHaveLength(1);
    expect(text).not.toContain('cdn/x.jpg');
  });
  it('klarar content före name och enkla citattecken', () => {
    expect(extractMetaText(`<meta content='Kort sammanfattning' name='description'>`)).toBe('Kort sammanfattning');
  });
  it('tom sträng när inget finns', () => {
    expect(extractMetaText('<html><body>hej</body></html>')).toBe('');
  });
});
