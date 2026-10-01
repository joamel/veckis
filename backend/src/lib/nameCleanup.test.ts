import { describe, expect, it } from 'vitest';
import { junkReason, suggestNameCleanup, variantGroups } from './nameCleanup';

describe('junkReason', () => {
  it('känner igen rader som inte är varor', () => {
    expect(junkReason('salt &amp;amp; svartpeppar')).toMatch(/HTML/);
    expect(junkReason('sås: 2 dl grädde')).toMatch(/kolon/);
    expect(junkReason('för 4 portioner fläskytterfilé 600 g och 1 msk smör')).not.toBeNull();
    expect(junkReason('rimmat sidfläsk')).toBeNull();
  });
});

describe('suggestNameCleanup', () => {
  it('föreslår radering, mängd ur namnet och ihopslagning av varianter', () => {
    const rows = suggestNameCleanup([
      { namn: 'sås: 2 dl grädde', vikt: 1 },
      { namn: '1/2 dl strösocker', vikt: 2 },
      { namn: 'kycklingfilé', vikt: 9 },
      { namn: 'kycklingfiléer', vikt: 3 },
      { namn: 'mjölk', vikt: 20 },
    ]);
    expect(rows.find(r => r.name === 'sås: 2 dl grädde')).toMatchObject({ action: 'delete' });
    expect(rows.find(r => r.name === '1/2 dl strösocker')).toMatchObject({ action: 'rename', to: 'strösocker' });
    expect(rows.find(r => r.name === 'kycklingfiléer')).toMatchObject({ action: 'rename', to: 'kycklingfilé' });
    expect(rows.find(r => r.name === 'mjölk')).toBeUndefined();
  });

  it('målnamnet i en variantgrupp är det bästa, inte bara det mest sedda', () => {
    const [group] = variantGroups([{ namn: 'havregry', vikt: 10 }, { namn: 'havregryn', vikt: 2 }]);
    expect(group[0].namn).toBe('havregryn');
  });
});
