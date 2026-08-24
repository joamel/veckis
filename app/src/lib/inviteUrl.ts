// Bygger delbar URL för en invite-kod. Hålls separat från inviteLink.ts
// (som importerar react-native för Share/Clipboard) så vi kan unit-testa
// utan att vitest behöver parsa react-native-modulens flow-syntax.
//
// Domänen där PWA hostas. Custom domain handlis.app (Render static site,
// veckis-web.onrender.com pekas om hit via CNAME). .app är HSTS-preloaded →
// tvingar HTTPS, vilket Render-certet löser.
const WEB_BASE_URL = 'https://handlis.app';

export function buildInviteUrl(code: string): string {
  return `${WEB_BASE_URL}/household/setup?code=${encodeURIComponent(code)}`;
}
