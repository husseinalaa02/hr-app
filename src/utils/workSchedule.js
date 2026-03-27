/**
 * Work schedule utilities.
 * Single source of truth for "is a given date an off day" checks.
 */

export const DEFAULT_OFF_DAYS = [5, 6]; // Friday, Saturday

export const DAY_NAMES = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  ar: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
};

/**
 * Returns the Baghdad local YYYY-MM-DD string for a Date.
 * Used so date comparisons are consistent with the rest of the app.
 */
function toBaghdadDate(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(date);
}

/**
 * Check if a given date is an off day for an employee.
 * @param {Date|string} date
 * @param {number[]} offDays  - day-of-week numbers (0=Sun … 6=Sat)
 * @param {string[]} holidays - YYYY-MM-DD strings of public holidays
 * @returns {boolean}
 */
export function isOffDay(date, offDays = DEFAULT_OFF_DAYS, holidays = []) {
  const d = typeof date === 'string' ? new Date(date + 'T12:00:00+03:00') : date;
  const dayOfWeek = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Baghdad', weekday: 'short' }).format(d);
  const dayIndex  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(dayOfWeek);
  const dateStr   = toBaghdadDate(d);
  return offDays.includes(dayIndex) || holidays.includes(dateStr);
}

/**
 * Check if a specific date is a public holiday.
 * @param {Date|string} date
 * @param {string[]} holidays - YYYY-MM-DD strings
 * @returns {boolean}
 */
export function isPublicHoliday(date, holidays = []) {
  const d = typeof date === 'string' ? new Date(date + 'T12:00:00+03:00') : date;
  return holidays.includes(toBaghdadDate(d));
}

/**
 * Count expected working days in a date range for an employee,
 * excluding their weekly off days and public holidays.
 * @param {string} from       - YYYY-MM-DD
 * @param {string} to         - YYYY-MM-DD
 * @param {number[]} offDays
 * @param {string[]} holidays
 * @returns {number}
 */
export function countWorkingDays(from, to, offDays = DEFAULT_OFF_DAYS, holidays = []) {
  let count = 0;
  const cur = new Date(from + 'T12:00:00+03:00');
  const end = new Date(to   + 'T12:00:00+03:00');
  while (cur <= end) {
    if (!isOffDay(cur, offDays, holidays)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}
