import { describe, expect, it } from 'vitest';
import { systemClock, type Clock } from '../../packages/contracts/src/index.js';

describe('Clock contract', () => {
  it('provides an injectable now() function', () => {
    const fixed: Clock = { now: () => new Date('2026-01-01T00:00:00.000Z') };
    expect(fixed.now().toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(systemClock.now()).toBeInstanceOf(Date);
  });
});
