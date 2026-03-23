import { describe, it, expect, vi } from 'vitest';

// Mock all side-effectful imports so pure functions can be tested in isolation
vi.mock('../../../src/db/index', () => ({ db: {} }), { virtual: true });
vi.mock('../../db/index', () => ({ db: {} }));
vi.mock('../../db/supabase', () => ({ supabase: null, SUPABASE_MODE: false }));
vi.mock('../mock', () => ({ MOCK_PAYROLL_RECORDS: [] }));
vi.mock('../leave', () => ({ ABSENCE_SALARY_DEDUCTION: 16_000 }));

import {
  calcDailySalary,
  calcFinalSalary,
  calcExtraDayValue,
  buildCalculatedSalary,
  FRIDAY_DAY_FIXED,
} from '../payroll';

describe('calcDailySalary', () => {
  it('divides (base + additional) by 30', () => {
    expect(calcDailySalary(900_000, 100_000)).toBeCloseTo(1_000_000 / 30);
  });
  it('handles zero additional', () => {
    expect(calcDailySalary(600_000, 0)).toBeCloseTo(20_000);
  });
});

describe('calcFinalSalary', () => {
  it('rounds daily rate × working days', () => {
    // 600k / 30 = 20k/day × 26 days = 520k
    expect(calcFinalSalary(600_000, 0, 26)).toBe(520_000);
  });
  it('full 30-day month equals base + additional', () => {
    expect(calcFinalSalary(600_000, 100_000, 30)).toBe(700_000);
  });
});

describe('calcExtraDayValue', () => {
  it('returns base ÷ 30 rounded', () => {
    expect(calcExtraDayValue(600_000)).toBe(20_000);
  });
});

describe('FRIDAY_DAY_FIXED', () => {
  it('is 25,000 IQD', () => {
    expect(FRIDAY_DAY_FIXED).toBe(25_000);
  });
});

describe('buildCalculatedSalary', () => {
  it('sums final salary, bonuses, and subtracts deductions', () => {
    const result = buildCalculatedSalary(
      600_000, // base
      0,       // additional
      26,      // working days  → 520,000
      25_000,  // friday bonus  → +25,000
      20_000,  // extra bonus   → +20,000
      4_000,   // late deduct   → -4,000
      16_000,  // absence deduct→ -16,000
    );
    expect(result).toBe(520_000 + 25_000 + 20_000 - 4_000 - 16_000); // 545,000
  });

  it('never returns negative', () => {
    expect(buildCalculatedSalary(0, 0, 0, 0, 0, 999_999, 999_999)).toBe(0);
  });

  it('treats missing deduction args as zero', () => {
    const withZeros    = buildCalculatedSalary(600_000, 0, 30, 0, 0, 0, 0);
    const withUndefined = buildCalculatedSalary(600_000, 0, 30, 0, 0, undefined, undefined);
    expect(withZeros).toBe(withUndefined);
  });

  it('full month, no bonuses or deductions = base salary', () => {
    expect(buildCalculatedSalary(750_000, 0, 30, 0, 0, 0, 0)).toBe(750_000);
  });
});
