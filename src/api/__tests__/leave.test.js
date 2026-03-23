import { describe, it, expect, vi } from 'vitest';

vi.mock('../../db/index', () => ({ db: {} }));
vi.mock('../../db/supabase', () => ({ supabase: null, SUPABASE_MODE: false }));
vi.mock('../mock', () => ({
  MOCK_LEAVE_APPLICATIONS: [],
  MOCK_HOURLY_APPLICATIONS: [],
  MOCK_ALLOCATIONS_V2: [],
  MOCK_EMPLOYEES: [],
}));
vi.mock('../payroll', () => ({ buildCalculatedSalary: () => 0 }));
vi.mock('../notifications', () => ({
  addNotification: vi.fn(),
  notifyRole: vi.fn(),
}));

import { calcDays, calcHours } from '../leave';

describe('calcDays', () => {
  it('counts working days (Mon–Thu + Sat–Sun) between two dates', () => {
    // 2024-01-01 is Monday. Week: Mon Tue Wed Thu Fri(skip) Sat Sun
    // Mon–Sun = 6 working days (Friday excluded)
    expect(calcDays('2024-01-01', '2024-01-07')).toBe(6);
  });

  it('returns 0 for a Friday-only range', () => {
    // 2024-01-05 is Friday
    expect(calcDays('2024-01-05', '2024-01-05')).toBe(0);
  });

  it('returns 1 for a single non-Friday day', () => {
    // 2024-01-01 is Monday
    expect(calcDays('2024-01-01', '2024-01-01')).toBe(1);
  });

  it('returns 0 when to < from', () => {
    expect(calcDays('2024-01-10', '2024-01-01')).toBe(0);
  });

  it('returns 0 for empty inputs', () => {
    expect(calcDays('', '')).toBe(0);
    expect(calcDays(null, null)).toBe(0);
  });

  it('counts a full month correctly', () => {
    // January 2024: 31 days, 4 Fridays (5,12,19,26) → 27 working days
    expect(calcDays('2024-01-01', '2024-01-31')).toBe(27);
  });
});

describe('calcHours', () => {
  it('calculates hours between two times', () => {
    expect(calcHours('09:00', '10:00')).toBe(1);
    expect(calcHours('08:00', '16:00')).toBe(8);
  });

  it('returns 0 when to_time <= from_time', () => {
    expect(calcHours('10:00', '09:00')).toBe(0);
    expect(calcHours('10:00', '10:00')).toBe(0);
  });

  it('handles fractional hours', () => {
    expect(calcHours('09:00', '09:30')).toBeCloseTo(0.5);
    expect(calcHours('09:00', '09:16')).toBeCloseTo(16 / 60);
  });
});
