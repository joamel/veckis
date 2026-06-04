import { describe, it, expect, vi } from 'vitest';
import { normalizeOrigin, parseAllowlist, makeOriginCheck } from './corsAllowlist';

describe('normalizeOrigin', () => {
  it('lowercase + trim + strip trailing slash', () => {
    expect(normalizeOrigin('  HTTPS://Example.COM/  ')).toBe('https://example.com');
  });

  it('hanterar flera trailing slashes', () => {
    expect(normalizeOrigin('https://example.com///')).toBe('https://example.com');
  });

  it('lämnar redan-normaliserad origin orörd', () => {
    expect(normalizeOrigin('https://veckis-web.onrender.com')).toBe('https://veckis-web.onrender.com');
  });

  it('hanterar tomma strängen', () => {
    expect(normalizeOrigin('')).toBe('');
    expect(normalizeOrigin('   ')).toBe('');
  });
});

describe('parseAllowlist', () => {
  it('fallback "*" när env är undefined', () => {
    expect(parseAllowlist(undefined)).toEqual(['*']);
  });

  it('split på komma + normalisera', () => {
    const list = parseAllowlist('https://A.com, https://B.com/ , HTTP://localhost:3000 ');
    expect(list).toEqual(['https://a.com', 'https://b.com', 'http://localhost:3000']);
  });

  it('filtrerar bort tomma element från trailing/extra komman', () => {
    expect(parseAllowlist('https://a.com,,,https://b.com,')).toEqual(['https://a.com', 'https://b.com']);
  });

  it('"*" kvar i listan om det skickas med', () => {
    expect(parseAllowlist('*')).toEqual(['*']);
    expect(parseAllowlist('*,https://a.com')).toEqual(['*', 'https://a.com']);
  });
});

describe('makeOriginCheck', () => {
  it('släpper igenom utan Origin-header (native appar)', () => {
    const check = makeOriginCheck(['https://a.com']);
    const cb = vi.fn();
    check(undefined, cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  it('släpper igenom om "*" finns i listan', () => {
    const check = makeOriginCheck(['*']);
    const cb = vi.fn();
    check('https://anything.com', cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  it('släpper igenom exakt match', () => {
    const check = makeOriginCheck(['https://veckis-web.onrender.com']);
    const cb = vi.fn();
    check('https://veckis-web.onrender.com', cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  it('släpper igenom match efter normalisering (trailing slash, case)', () => {
    const check = makeOriginCheck(['https://veckis-web.onrender.com']);
    const cb = vi.fn();
    check('HTTPS://Veckis-Web.OnRender.com/', cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  it('blockerar icke-match', () => {
    const check = makeOriginCheck(['https://veckis-web.onrender.com']);
    const cb = vi.fn();
    check('https://attacker.com', cb);
    expect(cb).toHaveBeenCalledWith(null, false);
  });

  it('loggar blockerad origin en gång per unik origin', () => {
    const logger = { warn: vi.fn() };
    const check = makeOriginCheck(['https://a.com'], logger);
    const cb = vi.fn();

    check('https://bad.com', cb);
    check('https://bad.com', cb);
    check('https://bad.com', cb);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0]).toContain('https://bad.com');

    check('https://other-bad.com', cb);
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });
});
