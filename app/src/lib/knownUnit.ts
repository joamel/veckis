/** Varans vanliga enhet ur hushållets basvaror (namn i gemener → enhet), om
 *  namnet matchar exakt. Samma uppslag oavsett om man tryckte på förslaget
 *  eller skrev klart namnet själv — förr fick bara förslaget enheten, så
 *  "gul lök" + "nästa" blev utan "st". */
export function knownUnitFor(unitByName: Record<string, string>, name: string): string | null {
  const key = name.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!key) return null;
  return unitByName[key] ?? null;
}
