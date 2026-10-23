import { describe, it, expect, vi, afterEach } from 'vitest';
import { isPrivateIp, harBrotli, safeFetch, BrotliBlockedError } from './ssrfGuard';

describe('isPrivateIp', () => {
  it('blockerar loopback + privata IPv4-nät', () => {
    for (const ip of ['127.0.0.1', '127.255.255.254', '10.0.0.1', '10.255.255.255',
      '192.168.1.1', '172.16.0.1', '172.31.255.255', '0.0.0.0']) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });

  it('blockerar molnets metadata-adress (169.254.169.254)', () => {
    expect(isPrivateIp('169.254.169.254')).toBe(true);
  });

  it('blockerar CGNAT (100.64.0.0/10) och multicast/reserverat', () => {
    expect(isPrivateIp('100.64.0.1')).toBe(true);
    expect(isPrivateIp('224.0.0.1')).toBe(true);
    expect(isPrivateIp('240.0.0.1')).toBe(true);
  });

  it('släpper igenom publika IPv4', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.15.255.255', '172.32.0.1']) {
      expect(isPrivateIp(ip), ip).toBe(false);
    }
  });

  it('blockerar IPv6 loopback/ULA/link-local + IPv4-mappad intern', () => {
    expect(isPrivateIp('::1')).toBe(true);
    expect(isPrivateIp('fe80::1')).toBe(true);
    expect(isPrivateIp('fd00::1')).toBe(true);
    expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateIp('::ffff:10.0.0.1')).toBe(true);
  });

  it('släpper igenom publik IPv6 + IPv4-mappad publik', () => {
    expect(isPrivateIp('2606:4700:4700::1111')).toBe(false);
    expect(isPrivateIp('::ffff:8.8.8.8')).toBe(false);
  });

  it('blockerar skräpinput', () => {
    expect(isPrivateIp('inte-en-ip')).toBe(true);
    expect(isPrivateIp('')).toBe(true);
  });
});

describe('Brotli-spärren', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('känner igen br, även i en lista', () => {
    expect(harBrotli('br')).toBe(true);
    expect(harBrotli('gzip, BR')).toBe(true);
    expect(harBrotli('gzip')).toBe(false);
    expect(harBrotli(null)).toBe(false);
  });

  it('ber bara om gzip/deflate', async () => {
    const fetchMock = vi.fn(async () => new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await safeFetch('http://93.184.216.34/', { headers: { 'Accept-Encoding': 'br' } });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get('accept-encoding')).toBe('gzip, deflate');
  });

  it('avbryter ett svar som ändå är Brotli-komprimerat', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 200, headers: { 'Content-Encoding': 'br' } })));
    await expect(safeFetch('http://93.184.216.34/')).rejects.toBeInstanceOf(BrotliBlockedError);
  });
});
