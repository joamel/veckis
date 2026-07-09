// SSRF-skydd för server-side URL-fetch (recept-import). Utan detta kan en
// användare få backenden att anropa interna adresser — molnets metadata-
// endpoint (169.254.169.254), localhost, privata nät — eller använda servern
// som proxy. Rate-limiting räcker INTE: en enda request gör skadan.
//
// Skyddet: (1) bara http/https, (2) blockera hostnamn som pekar mot interna
// tjänster, (3) DNS-slå upp och blockera om NÅGON resolverad IP är privat/
// reserverad, (4) följ redirects manuellt och om-validera varje hopp (den
// klassiska bypassen är en publik URL som redirectar till en intern).
import { lookup } from 'dns/promises';
import net from 'net';

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0;
}

function inRange(ip: number, cidr: string): boolean {
  const [base, bits] = cidr.split('/');
  const mask = bits === '0' ? 0 : (~0 << (32 - parseInt(bits, 10))) >>> 0;
  return (ip & mask) === (ipv4ToInt(base) & mask);
}

// Privata/reserverade IPv4-block som aldrig ska nås utifrån.
const BLOCKED_V4 = [
  '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8',
  '169.254.0.0/16', '172.16.0.0/12', '192.0.0.0/24', '192.168.0.0/16',
  '198.18.0.0/15', '224.0.0.0/4', '240.0.0.0/4',
];

export function isPrivateIp(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) {
    const n = ipv4ToInt(ip);
    return BLOCKED_V4.some(cidr => inRange(n, cidr));
  }
  if (kind === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;         // loopback/unspecified
    if (lower.startsWith('fe80') || lower.startsWith('fc') || lower.startsWith('fd')) return true; // link-local + ULA
    // IPv4-mappad (::ffff:a.b.c.d) — validera den inbäddade IPv4:an.
    const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  return true; // okänt format → blockera
}

const BLOCKED_HOSTNAMES = /^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i;

async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('Ogiltig URL'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Endast http/https tillåts');
  }
  const host = url.hostname.replace(/^\[|\]$/g, ''); // strip IPv6-brackets
  if (BLOCKED_HOSTNAMES.test(host)) throw new Error('Blockerad värd');
  // IP-literal i URL:en → validera direkt.
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error('Intern adress blockerad');
    return url;
  }
  // Hostnamn → slå upp ALLA adresser och blockera om någon är privat
  // (skydd mot DNS som returnerar både publik och intern post).
  const addrs = await lookup(host, { all: true });
  if (addrs.length === 0) throw new Error('Kunde inte slå upp värden');
  for (const a of addrs) {
    if (isPrivateIp(a.address)) throw new Error('Värden pekar mot en intern adress');
  }
  return url;
}

/**
 * fetch() med SSRF-skydd: validerar måladressen och följer redirects manuellt
 * (om-validerar varje hopp). Drop-in för scrape-flödet.
 */
export async function safeFetch(
  raw: string,
  opts: RequestInit & { maxRedirects?: number } = {},
): Promise<Response> {
  const { maxRedirects = 3, ...init } = opts;
  let current = raw;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const url = await assertPublicUrl(current);
    const res = await fetch(url, { ...init, redirect: 'manual' });
    // 3xx med Location → validera nästa hopp innan vi följer det.
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return res;
      current = new URL(loc, url).toString();
      continue;
    }
    return res;
  }
  throw new Error('För många omdirigeringar');
}
