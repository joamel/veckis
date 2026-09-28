import { describe, expect, it } from 'vitest';
import { cloudinaryOptimized } from './cloudinaryUrl';

describe('cloudinaryOptimized', () => {
  it('lägger in bredd, kvalitet och format efter /upload/', () => {
    expect(cloudinaryOptimized('https://res.cloudinary.com/demo/image/upload/v1/recept/abc.jpg', 600))
      .toBe('https://res.cloudinary.com/demo/image/upload/w_600,q_auto,f_auto/v1/recept/abc.jpg');
  });

  it('rör inte andra adresser', () => {
    expect(cloudinaryOptimized('https://example.com/upload/bild.jpg')).toBe('https://example.com/upload/bild.jpg');
    expect(cloudinaryOptimized('https://example.com/bild.jpg')).toBe('https://example.com/bild.jpg');
  });
});
