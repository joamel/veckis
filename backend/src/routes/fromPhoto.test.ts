import { describe, it, expect } from 'vitest';
import { delaUppDataUrl, MAX_SIDOR } from './recipes';

describe('delaUppDataUrl', () => {
  it('ren base64 antas vara JPEG — det är vad appen komprimerar till', () => {
    expect(delaUppDataUrl('AAAABBBB')).toEqual({ mediaType: 'image/jpeg', base64: 'AAAABBBB' });
  });

  it('plockar isär en data-URL och behåller media type', () => {
    expect(delaUppDataUrl('data:image/png;base64,XYZ')).toEqual({ mediaType: 'image/png', base64: 'XYZ' });
  });

  it('okänd media type faller tillbaka på JPEG i stället för att skicka något Claude avvisar', () => {
    expect(delaUppDataUrl('data:image/tiff;base64,XYZ')).toEqual({ mediaType: 'image/jpeg', base64: 'XYZ' });
  });

  it('trasig data-URL utan komma behandlas som ren base64', () => {
    expect(delaUppDataUrl('data:image/png;base64')).toEqual({ mediaType: 'image/jpeg', base64: 'data:image/png;base64' });
  });

  it('taket är detsamma som appens', () => {
    expect(MAX_SIDOR).toBe(5);
  });
});
