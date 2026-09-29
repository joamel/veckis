import { describe, expect, it } from 'vitest';
import { isPantryBasic } from './pantryBasics';

describe('isPantryBasic', () => {
  it('räknar salt, peppar och vatten, även med vanliga tillägg', () => {
    for (const n of ['salt', 'Salt', 'peppar', 'svartpeppar', 'vatten', 'salt och peppar', 'Salt & svartpeppar efter smak', 'kokande vatten', 'nymald svartpeppar', 'flingsalt']) {
      expect(isPantryBasic(n), n).toBe(true);
    }
  });

  it('räknar inte varor som bara innehåller orden', () => {
    for (const n of ['pepparrot', 'saltgurka', 'kokosvatten', 'smör och salt', 'citronpeppar', 'saltade jordnötter', 'grönpeppar i lag', 'paprika']) {
      expect(isPantryBasic(n), n).toBe(false);
    }
  });
});
