import { describe, it, expect } from 'vitest';
import { buildInviteUrl } from './inviteUrl';

describe('buildInviteUrl', () => {
  it('bygger URL med kod-parametern', () => {
    expect(buildInviteUrl('ABCD1234')).toBe('https://veckis-web.onrender.com/household/setup?code=ABCD1234');
  });

  it('URL-encodar specialtecken i koden', () => {
    // 8-tecken-koden är A-Z + 0-9 i praktiken så detta bör inte hända, men
    // vi vill ändå inte producera en bruten URL om servern någon gång ger
    // tillbaka konstiga koder.
    expect(buildInviteUrl('AB CD&#?')).toBe('https://veckis-web.onrender.com/household/setup?code=AB%20CD%26%23%3F');
  });

  it('hanterar tom kod utan att krascha', () => {
    expect(buildInviteUrl('')).toBe('https://veckis-web.onrender.com/household/setup?code=');
  });
});
