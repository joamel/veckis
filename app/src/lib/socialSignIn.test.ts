import { describe, expect, it } from 'vitest';
import { isGoogleSignInAvailable } from './socialSignIn';

describe('isGoogleSignInAvailable', () => {
  it('visas alltid på Android och webb, oavsett iOS-id', () => {
    expect(isGoogleSignInAvailable('android', undefined)).toBe(true);
    expect(isGoogleSignInAvailable('web', undefined)).toBe(true);
  });

  it('döljs på iOS när iOS-klient-id saknas eller är tomt', () => {
    expect(isGoogleSignInAvailable('ios', undefined)).toBe(false);
    expect(isGoogleSignInAvailable('ios', '')).toBe(false);
    expect(isGoogleSignInAvailable('ios', '   ')).toBe(false);
  });

  it('visas på iOS när iOS-klient-id finns', () => {
    expect(isGoogleSignInAvailable('ios', '123-abc.apps.googleusercontent.com')).toBe(true);
  });
});
