import { describe, it, expect } from 'vitest';
import { buildInviteUrl, normalizeInviteCode } from './inviteUrl';

describe('buildInviteUrl', () => {
  it('bygger URL med kod-parametern', () => {
    expect(buildInviteUrl('ABCD1234')).toBe('https://handlis.app/household/setup?code=ABCD1234');
  });

  it('URL-encodar specialtecken i koden', () => {
    // 8-tecken-koden är A-Z + 0-9 i praktiken så detta bör inte hända, men
    // vi vill ändå inte producera en bruten URL om servern någon gång ger
    // tillbaka konstiga koder.
    expect(buildInviteUrl('AB CD&#?')).toBe('https://handlis.app/household/setup?code=AB%20CD%26%23%3F');
  });

  it('hanterar tom kod utan att krascha', () => {
    expect(buildInviteUrl('')).toBe('https://handlis.app/household/setup?code=');
  });
});

describe('normalizeInviteCode', () => {
  it('gör om till versaler', () => {
    expect(normalizeInviteCode('ab12cd34')).toBe('AB12CD34');
  });

  it('tar koden ur en inklistrad inbjudningslänk', () => {
    expect(normalizeInviteCode(buildInviteUrl('ab12cd34'))).toBe('AB12CD34');
  });

  it('tar bort mellanslag och bindestreck', () => {
    expect(normalizeInviteCode('AB12 CD-34')).toBe('AB12CD34');
  });

  it('kapar vid åtta tecken', () => {
    expect(normalizeInviteCode('AB12CD34EF')).toBe('AB12CD34');
  });
});
