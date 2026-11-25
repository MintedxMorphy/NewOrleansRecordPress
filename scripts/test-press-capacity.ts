import {
  MAJOR_HOLIDAYS_PER_YEAR,
  OPERATING_DAYS_PER_WEEK,
  RECORDS_PER_OPERATING_DAY,
  RECORDS_PER_SHIFT,
  RECORDS_PER_WEEK,
  SHIFTS_PER_DAY,
  calendarDaysForRecords,
  pressHorizonForRecords,
} from '../lib/press-capacity.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`ok: ${message}`);
  }
}

assert(RECORDS_PER_SHIFT === 400, '400 records per shift');
assert(SHIFTS_PER_DAY === 2, 'two shifts a day');
assert(OPERATING_DAYS_PER_WEEK === 5, 'five press days a week');
assert(MAJOR_HOLIDAYS_PER_YEAR === 10, 'ten holiday closures');
assert(RECORDS_PER_OPERATING_DAY === 800, '800 records on a press day');
assert(RECORDS_PER_WEEK === 4000, '4,000 records in a normal week');

assert(calendarDaysForRecords(0) === 0, 'empty backlog is zero calendar days');
assert(pressHorizonForRecords(0) === 'Caught up', 'empty backlog is caught up');

const oneWeek = calendarDaysForRecords(4000);
assert(Math.abs(oneWeek - 7.28) < 0.001, `one normal week is about 7.28 calendar days, got ${oneWeek}`);
assert(pressHorizonForRecords(4000) === '7 days out', 'one normal week reads as 7 days out');

// 61,595 was the backlog on the board when this pace replaced 350/day.
const sample = 61595;
const sampleDays = calendarDaysForRecords(sample);
assert(Math.abs(sampleDays - 112.103) < 0.01, `61,595 records is about 112 calendar days, got ${sampleDays}`);
assert(pressHorizonForRecords(sample) === '3 months, 22 days out', '61,595 records reads as 3 months, 22 days out');
