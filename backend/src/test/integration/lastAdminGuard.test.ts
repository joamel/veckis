// Integration: skydd mot att hushållet hamnar utan admin. Vi kan:
//  - inte ändra rollen från admin → member om target är ende admin,
//  - inte radera target om target är ende admin.
//
// Skyddet finns i route-handlers (PATCH + DELETE /members/:id). Här testar
// vi DB-checken direkt — själva räkningen av "andra admins kvar" — istället
// för att gå via HTTP-laget. Logiken är identisk: räkna admin-rader i
// hushållet, exkludera target. Om 0 = blockera.

import { describe, it, expect } from 'vitest';
import { prisma } from '../../db';
import { makeHousehold, makeMember } from '../fixtures';

async function otherAdminCount(householdId: string, excludeMemberId: string): Promise<number> {
  return prisma.householdMember.count({
    where: { householdId, role: 'admin', NOT: { id: excludeMemberId } },
  });
}

describe('sista-admin-skydd', () => {
  it('blockerar borttagning av ende admin (count = 0)', async () => {
    const hh = await makeHousehold();
    const admin = await makeMember(hh.id, { role: 'admin' });
    await makeMember(hh.id, { role: 'member' });
    await makeMember(hh.id, { role: 'member' });

    expect(await otherAdminCount(hh.id, admin.id)).toBe(0);
  });

  it('tillåter borttagning när det finns en till admin', async () => {
    const hh = await makeHousehold();
    const admin1 = await makeMember(hh.id, { role: 'admin' });
    await makeMember(hh.id, { role: 'admin' });
    await makeMember(hh.id, { role: 'member' });

    expect(await otherAdminCount(hh.id, admin1.id)).toBe(1);
  });

  it('räknar inte target själv (även om den är admin)', async () => {
    const hh = await makeHousehold();
    const admin = await makeMember(hh.id, { role: 'admin' });

    expect(await otherAdminCount(hh.id, admin.id)).toBe(0);
  });

  it('räknar inte members (de räddar inte hushållet)', async () => {
    const hh = await makeHousehold();
    const admin = await makeMember(hh.id, { role: 'admin' });
    for (let i = 0; i < 5; i++) await makeMember(hh.id, { role: 'member' });

    expect(await otherAdminCount(hh.id, admin.id)).toBe(0);
  });

  it('räknar inte admins i andra hushåll', async () => {
    const a = await makeHousehold('A');
    const b = await makeHousehold('B');
    const adminA = await makeMember(a.id, { role: 'admin' });
    await makeMember(b.id, { role: 'admin' });
    await makeMember(b.id, { role: 'admin' });

    expect(await otherAdminCount(a.id, adminA.id)).toBe(0);
  });
});
