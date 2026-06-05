import { describe, it, expect } from 'vitest';
import { randomDelay } from '../../utils/delay.js';

describe('queue delay', () => {
  it('random delay stays within bounds', () => {
    for (let i = 0; i < 50; i++) {
      const d = randomDelay(3000, 8000);
      expect(d).toBeGreaterThanOrEqual(3000);
      expect(d).toBeLessThanOrEqual(8000);
    }
  });
});
