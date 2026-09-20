import { describe, it, expect, afterEach } from 'vitest';
import { appAdmins, ärAppAdmin } from '../middleware/auth';

const original = process.env.ADMIN_CLERK_USER_IDS;
afterEach(() => { process.env.ADMIN_CLERK_USER_IDS = original; });

describe('appAdmins', () => {
  it('läser kommaseparerad lista och trimmar', () => {
    process.env.ADMIN_CLERK_USER_IDS = ' user_a , user_b ';
    expect(appAdmins()).toEqual(['user_a', 'user_b']);
  });

  it('tom eller osatt variabel ger ingen admin — fail closed', () => {
    // Ett bommat variabelnamn ska stänga dörren, inte öppna den.
    delete process.env.ADMIN_CLERK_USER_IDS;
    expect(appAdmins()).toEqual([]);
    expect(ärAppAdmin('user_a')).toBe(false);

    process.env.ADMIN_CLERK_USER_IDS = '  ,, ';
    expect(appAdmins()).toEqual([]);
  });

  it('ärAppAdmin kräver exakt träff', () => {
    process.env.ADMIN_CLERK_USER_IDS = 'user_abc';
    expect(ärAppAdmin('user_abc')).toBe(true);
    // Ingen delsträngsmatchning — ett längre id som råkar innehålla ägarens
    // ska aldrig slinka igenom.
    expect(ärAppAdmin('user_abcdef')).toBe(false);
    expect(ärAppAdmin('user_ab')).toBe(false);
  });
});
