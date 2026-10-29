import { describe, it, expect, beforeEach } from 'vitest';
import { claimNudge, resetNudgesForTest } from './nudges';

describe('claimNudge', () => {
  beforeEach(resetNudgesForTest);

  it('släpper fram den första påminnelsen i sessionen', () => {
    expect(claimNudge('instagram-tab')).toBe(true);
  });

  it('stoppar de andra i samma session', () => {
    claimNudge('instagram-tab');
    expect(claimNudge('instagram-card')).toBe(false);
    expect(claimNudge('review')).toBe(false);
  });

  it('låter samma påminnelse visas igen (fliken monteras om)', () => {
    claimNudge('instagram-tab');
    expect(claimNudge('instagram-tab')).toBe(true);
  });
});
