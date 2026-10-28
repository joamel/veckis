import { describe, it, expect } from 'vitest';
import type { IncomingMessage } from 'node:http';
import { clientIp } from './clientIp';

const req = (headers: Record<string, string | string[]>, ip?: string) =>
  ({ headers, ip, socket: { remoteAddress: '10.0.0.9' } }) as unknown as IncomingMessage & { ip?: string };

describe('clientIp', () => {
  it('tar första adressen i X-Forwarded-For även med flera proxyhopp', () => {
    expect(clientIp(req({ 'x-forwarded-for': '81.2.3.4, 100.64.0.2, 10.0.0.5' }, '10.0.0.5'))).toBe('81.2.3.4');
  });

  it('klarar en ensam adress', () => {
    expect(clientIp(req({ 'x-forwarded-for': '81.2.3.4' }))).toBe('81.2.3.4');
  });

  it('faller tillbaka på req.ip och sedan socketen utan header', () => {
    expect(clientIp(req({}, '81.2.3.4'))).toBe('81.2.3.4');
    expect(clientIp(req({}))).toBe('10.0.0.9');
  });
});
