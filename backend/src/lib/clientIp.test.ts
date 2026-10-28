import { describe, it, expect } from 'vitest';
import type { IncomingMessage } from 'node:http';
import { clientIp } from './clientIp';

const req = (headers: Record<string, string | string[]>, ip?: string) =>
  ({ headers, ip, socket: { remoteAddress: '10.0.0.9' } }) as unknown as IncomingMessage & { ip?: string };

// Så ser Railways headrar ut (uppmätt 2026-10-28): klienten först, kantens
// publika adress — gemensam för alla användare — sist.
const railway = { 'x-real-ip': '81.2.3.4', 'x-forwarded-for': '81.2.3.4, 152.233.0.7' };

describe('clientIp', () => {
  it('tar klienten, aldrig Railways gemensamma kantadress', () => {
    expect(clientIp(req(railway, '152.233.0.7'))).toBe('81.2.3.4');
  });

  it('föredrar X-Real-IP framför X-Forwarded-For', () => {
    expect(clientIp(req({ 'x-real-ip': '81.2.3.4', 'x-forwarded-for': '9.9.9.9' }))).toBe('81.2.3.4');
  });

  it('tar första adressen i X-Forwarded-For utan X-Real-IP', () => {
    expect(clientIp(req({ 'x-forwarded-for': '81.2.3.4, 152.233.0.7' }))).toBe('81.2.3.4');
  });

  it('klarar IPv6', () => {
    expect(clientIp(req({ 'x-real-ip': '2a02:aa1::5' }))).toBe('2a02:aa1::5');
  });

  it('hoppar över skräp och faller tillbaka på req.ip och sedan socketen', () => {
    expect(clientIp(req({ 'x-real-ip': 'hej', 'x-forwarded-for': 'unknown' }, '81.2.3.4'))).toBe('81.2.3.4');
    expect(clientIp(req({}))).toBe('10.0.0.9');
  });
});
