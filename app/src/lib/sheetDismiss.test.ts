import { describe, expect, it } from 'vitest';
import { shouldDismissSheet } from './sheetDismiss';

describe('shouldDismissSheet', () => {
  it('långt drag och lugnt släpp stänger', () => {
    expect(shouldDismissSheet(150, 0)).toBe(true);
  });

  it('kastas arket uppåt vid släppet stannar det, även långt nedanför', () => {
    expect(shouldDismissSheet(250, -600)).toBe(false);
  });

  it('snabb svep nedåt stänger även om den är kort', () => {
    expect(shouldDismissSheet(40, 1400)).toBe(true);
  });

  it('kort, lugnt drag fjädrar tillbaka', () => {
    expect(shouldDismissSheet(60, 300)).toBe(false);
  });

  it('en snabb ryckning på några pixlar räcker inte', () => {
    expect(shouldDismissSheet(8, 1500)).toBe(false);
  });
});
