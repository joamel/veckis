import { describe, expect, it } from 'vitest';
import { isPantryBasic } from './pantryBasics';

describe('isPantryBasic', () => {
  it('räknar salt, peppar, vatten och vanlig olja, även med vanliga tillägg', () => {
    for (const n of ['salt', 'Salt', 'peppar', 'svartpeppar', 'vatten', 'salt och peppar', 'Salt & svartpeppar efter smak', 'kokande vatten', 'nymald svartpeppar', 'flingsalt', 'olja', 'rapsolja', 'neutral olja', 'olja till stekning', 'olja att steka i', 'olja och salt']) {
      expect(isPantryBasic(n), n).toBe(true);
    }
  });

  it('räknar inte varor som bara innehåller orden', () => {
    for (const n of ['pepparrot', 'saltgurka', 'kokosvatten', 'smör och salt', 'citronpeppar', 'saltade jordnötter', 'grönpeppar i lag', 'paprika', 'olivolja', 'sesamolja', 'chiliolja', 'tryffelolja', 'tonfisk i olja']) {
      expect(isPantryBasic(n), n).toBe(false);
    }
  });
});
