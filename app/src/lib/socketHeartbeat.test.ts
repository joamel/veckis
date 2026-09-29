import { describe, expect, it } from 'vitest';
import { HEARTBEAT_TIMEOUT_MS, isHeartbeat, isSilent } from './socketHeartbeat';

describe('socketHeartbeat', () => {
  it('känner igen hjärtslaget och inget annat', () => {
    expect(isHeartbeat({ type: 'heartbeat' })).toBe(true);
    expect(isHeartbeat({ type: 'item_added' })).toBe(false);
    expect(isHeartbeat(null)).toBe(false);
  });

  it('räknar anslutningen som död först efter två missade slag och marginal', () => {
    const t = 1_000_000;
    expect(isSilent(t, t + 30_000)).toBe(false);
    expect(isSilent(t, t + 60_000)).toBe(false);
    expect(isSilent(t, t + HEARTBEAT_TIMEOUT_MS + 1)).toBe(true);
  });
});
