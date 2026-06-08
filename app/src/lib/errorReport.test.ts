// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

// expo-constants drar in native-moduler — mocka så modulen kan importeras i test.
vi.mock('expo-constants', () => ({ default: { expoConfig: { version: '9.9.9' } } }));

import { buildErrorReport } from './errorReport';

const meta = { platform: 'ios', appVersion: '1.2.3' };

describe('buildErrorReport', () => {
  it('extraherar name/message/stack ur ett Error', () => {
    const e = new Error('boom');
    e.name = 'TypeError';
    const r = buildErrorReport(e, { kind: 'render' }, meta);
    expect(r.name).toBe('TypeError');
    expect(r.message).toBe('boom');
    expect(r.stack).toContain('boom');
    expect(r.context).toEqual({ kind: 'render' });
    expect(r.platform).toBe('ios');
    expect(r.appVersion).toBe('1.2.3');
    expect(typeof r.at).toBe('string');
  });

  it('hanterar ett kastat icke-Error-värde (sträng)', () => {
    const r = buildErrorReport('plain string', {}, meta);
    expect(r.name).toBe('Error');
    expect(r.message).toBe('plain string');
    expect(r.stack).toBeNull();
  });

  it('trunkerar långa message och stack', () => {
    const long = 'x'.repeat(10000);
    const e = new Error(long);
    e.stack = long;
    const r = buildErrorReport(e, {}, meta);
    expect(r.message.length).toBe(4000);
    expect(r.stack?.length).toBe(8000);
  });

  it('faller tillbaka till "Okänt fel" vid tomt meddelande', () => {
    const r = buildErrorReport(new Error(''), {}, meta);
    expect(r.message).toBe('Okänt fel');
  });
});
