// Bygger delbar URL för en invite-kod. Hålls separat från inviteLink.ts
// (som importerar react-native för Share/Clipboard) så vi kan unit-testa
// utan att vitest behöver parsa react-native-modulens flow-syntax.
//
// Domänen där PWA hostas. Kan flyttas till en env var senare när vi byter
// till custom domain — för nu hardcoded.
const WEB_BASE_URL = 'https://veckis-web.onrender.com';

export function buildInviteUrl(code: string): string {
  return `${WEB_BASE_URL}/household/setup?code=${encodeURIComponent(code)}`;
}
