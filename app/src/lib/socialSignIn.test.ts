import { describe, expect, it } from 'vitest';
import { isGoogleSignInAvailable } from './socialSignIn';

const ID = '123-abc.apps.googleusercontent.com';

describe('isGoogleSignInAvailable', () => {
  it('visas alltid på Android och webb, oavsett iOS-id', () => {
    expect(isGoogleSignInAvailable('android', undefined)).toBe(true);
    expect(isGoogleSignInAvailable('web', undefined)).toBe(true);
  });

  it('döljs på iOS när iOS-klient-id saknas eller är tomt', () => {
    expect(isGoogleSignInAvailable('ios', undefined, '9')).toBe(false);
    expect(isGoogleSignInAvailable('ios', '', '9')).toBe(false);
    expect(isGoogleSignInAvailable('ios', '   ', '9')).toBe(false);
  });

  it('döljs på iOS-byggen utan URL-schemat, även när id:t kommit via OTA', () => {
    expect(isGoogleSignInAvailable('ios', ID, '4')).toBe(false);
    expect(isGoogleSignInAvailable('ios', ID, null)).toBe(false);
    expect(isGoogleSignInAvailable('ios', ID, undefined)).toBe(false);
  });

  it('visas på iOS när id finns och bygget är nytt nog', () => {
    expect(isGoogleSignInAvailable('ios', ID, '5')).toBe(true);
    expect(isGoogleSignInAvailable('ios', ID, '12')).toBe(true);
  });
});
