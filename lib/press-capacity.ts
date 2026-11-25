// Press-room pace for the "still to press" calendar estimate.
// A normal week is 5 days × 2 shifts × 400 records = 4,000 records.
// The shop is also closed about 10 weekday holidays a year, so the
// horizon is calendar time: 260 weekdays minus those 10 holidays is
// 250 press days, spread across 52 × 7 = 364 calendar days.

export const RECORDS_PER_SHIFT = 400;
export const SHIFTS_PER_DAY = 2;
export const OPERATING_DAYS_PER_WEEK = 5;
export const MAJOR_HOLIDAYS_PER_YEAR = 10;

export const RECORDS_PER_OPERATING_DAY = RECORDS_PER_SHIFT * SHIFTS_PER_DAY;
export const RECORDS_PER_WEEK = RECORDS_PER_OPERATING_DAY * OPERATING_DAYS_PER_WEEK;

const WEEKS_PER_YEAR = 52;
const WEEKDAYS_PER_YEAR = WEEKS_PER_YEAR * OPERATING_DAYS_PER_WEEK;
const OPERATING_DAYS_PER_YEAR = WEEKDAYS_PER_YEAR - MAJOR_HOLIDAYS_PER_YEAR;
const CALENDAR_DAYS_PER_YEAR = WEEKS_PER_YEAR * 7;

export function calendarDaysForRecords(records: number) {
  if (!Number.isFinite(records) || records <= 0) return 0;
  const operatingDays = records / RECORDS_PER_OPERATING_DAY;
  return operatingDays * (CALENDAR_DAYS_PER_YEAR / OPERATING_DAYS_PER_YEAR);
}

export function formatPressHorizon(days: number) {
  if (!Number.isFinite(days) || days <= 0) return 'Caught up';
  if (days < 1) return 'Under 1 day';
  if (days < 30) {
    const n = Math.max(1, Math.round(days));
    return `${n} day${n === 1 ? '' : 's'} out`;
  }
  const months = Math.floor(days / 30);
  const remainingDays = Math.round(days % 30);
  const mPart = `${months} month${months === 1 ? '' : 's'}`;
  if (remainingDays === 0) return `${mPart} out`;
  const dPart = `${remainingDays} day${remainingDays === 1 ? '' : 's'}`;
  return `${mPart}, ${dPart} out`;
}

export function pressHorizonForRecords(records: number) {
  return formatPressHorizon(calendarDaysForRecords(records));
}
