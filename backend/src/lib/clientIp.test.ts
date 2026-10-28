import { describe, it, expect } from 'vitest';
import type { IncomingMessage } from 'node:http';
import { clientIp, isInternal } from './clientIp';

const req = (headers: Record<string, string | string[]>, ip?: string) =>
  ({ headers, ip, socket: { remoteAddress: '10.0.0.9' } }) as unknown as IncomingMessage & { ip?: string };

describe('clientIp', () => {
  it('hoppar över Railways interna hopp', () => {
    expect(clientIp(req({ 'x-forwarded-for': '81.2.3.4, 100.64.0.2, 10.0.0.5' }, '10.0.0.5'))).toBe('81.2.3.4');
  });

  it('klarar en ensam adress', () => {
    expect(clientIp(req({ 'x-forwarded-for': '81.2.3.4' }))).toBe('81.2.3.4');
  });

  it('går inte att lura med en påhittad adress först i headern', () => {
    expect(clientIp(req({ 'x-forwarded-for': '1.1.1.1, 81.2.3.4, 100.64.0.2' }))).toBe('81.2.3.4');
    expect(clientIp(req({ 'x-forwarded-for': '1.1.1.1, 81.2.3.4' }))).toBe('81.2.3.4');
  });

  it('ignorerar skräp och tar IPv6-klienter', () => {
    expect(clientIp(req({ 'x-forwarded-for': 'hej, 2a02:aa1::5, fd12::1' }))).toBe('2a02:aa1::5');
  });

  it('läser flera headerrader i ordning', () => {
    expect(clientIp(req({ 'x-forwarded-for': ['1.1.1.1', '81.2.3.4, 10.0.0.5'] }))).toBe('81.2.3.4');
  });

  it('faller tillbaka på req.ip och sedan socketen utan publik adress', () => {
    expect(clientIp(req({ 'x-forwarded-for': '10.0.0.5' }, '81.2.3.4'))).toBe('81.2.3.4');
    expect(clientIp(req({}))).toBe('10.0.0.9');
  });
});

describe('isInternal', () => {
  it('känner igen privata och CGNAT-adresser', () => {
    for (const ip of ['10.1.2.3', '172.16.0.1', '172.31.255.1', '192.168.1.1', '100.64.0.1', '100.127.9.9', '127.0.0.1', '169.254.1.1', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) {
      expect(isInternal(ip), ip).toBe(true);
    }
  });

  it('släpper publika adresser', () => {
    for (const ip of ['81.2.3.4', '172.32.0.1', '100.128.0.1', '8.8.8.8', '2a02:aa1::5', '::ffff:81.2.3.4']) {
      expect(isInternal(ip), ip).toBe(false);
    }
  });
});
