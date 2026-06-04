import { describe, it, expect } from 'vitest';
import { detectInstallTargetFor } from './installDetect';

// Testar den rena funktionen som tar UA + touch-points direkt — slipper
// mocka globala navigator/window och får deterministiska resultat.

describe('detectInstallTargetFor', () => {
  it('returnerar "unknown" utan UA (SSR)', () => {
    expect(detectInstallTargetFor(undefined)).toBe('unknown');
    expect(detectInstallTargetFor('')).toBe('unknown');
  });

  it('Android Chrome → "android-chrome"', () => {
    expect(detectInstallTargetFor(
      'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
    )).toBe('android-chrome');
  });

  it('Android Samsung Internet → "android-chrome" (Chromium-baserad)', () => {
    expect(detectInstallTargetFor(
      'Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
    )).toBe('android-chrome');
  });

  it('Android Firefox → "android-other"', () => {
    expect(detectInstallTargetFor(
      'Mozilla/5.0 (Android 13; Mobile; rv:120.0) Gecko/120.0 Firefox/120.0',
    )).toBe('android-other');
  });

  it('iOS Safari på iPhone → "ios-safari"', () => {
    expect(detectInstallTargetFor(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
    )).toBe('ios-safari');
  });

  it('iOS Chrome (CriOS) → "ios-other"', () => {
    expect(detectInstallTargetFor(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/119.0.6045.169 Mobile/15E148 Safari/604.1',
    )).toBe('ios-other');
  });

  it('Desktop Chrome → "desktop-chromium"', () => {
    expect(detectInstallTargetFor(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    )).toBe('desktop-chromium');
  });

  it('Desktop Edge → "desktop-chromium"', () => {
    expect(detectInstallTargetFor(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
    )).toBe('desktop-chromium');
  });

  it('Desktop Firefox → "desktop-firefox"', () => {
    expect(detectInstallTargetFor(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
    )).toBe('desktop-firefox');
  });

  it('Desktop Safari på Mac → "desktop-safari"', () => {
    expect(detectInstallTargetFor(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    )).toBe('desktop-safari');
  });

  it('iPad Pro (Safari rapporterar sig som Mac men har touch) → "ios-safari"', () => {
    // Modern iPad-Safari maskerar sig som Mac men har maxTouchPoints > 1
    expect(detectInstallTargetFor(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      5,
    )).toBe('ios-safari');
  });

  it('iPad Pro utan touch fallar tillbaka till desktop-safari (Mac-Safari)', () => {
    // Samma UA men maxTouchPoints = 0 → tolkas som faktisk Mac
    expect(detectInstallTargetFor(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      0,
    )).toBe('desktop-safari');
  });
});
