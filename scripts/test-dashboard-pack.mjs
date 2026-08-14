function packSkyline(items, columnCount, gap) {
  const fill = Array.from({ length: columnCount }, () => 0);
  const sorted = [...items].sort((a, b) => a.sort - b.sort || a.tiebreak.localeCompare(b.tiebreak));

  return sorted.map(item => {
    const start = Math.max(0, Math.min(item.start, columnCount - 1));
    const end = Math.max(start, Math.min(item.end, columnCount - 1));
    let top = 0;
    for (let column = start; column <= end; column += 1) {
      top = Math.max(top, fill[column] ?? 0);
    }
    const bottom = top + Math.max(0, item.height) + gap;
    for (let column = start; column <= end; column += 1) {
      fill[column] = bottom;
    }
    return { ...item, top };
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`ok: ${message}`);
  }
}

const packedSameColumn = packSkyline([
  { id: 'sam', start: 2, end: 2, height: 180, sort: 1, tiebreak: 'sam' },
  { id: 'pres', start: 2, end: 4, height: 200, sort: 2, tiebreak: 'pres' },
], 7, 0);
assert(packedSameColumn[0].top === 0, 'short job in Pressing starts at top');
assert(packedSameColumn[1].top === 180, 'span sits directly under the short Pressing job');

const packedIndependent = packSkyline([
  { id: 'a', start: 0, end: 0, height: 100, sort: 1, tiebreak: 'a' },
  { id: 'b', start: 3, end: 3, height: 100, sort: 2, tiebreak: 'b' },
], 7, 0);
assert(packedIndependent[0].top === 0 && packedIndependent[1].top === 0, 'jobs in different columns share the top');

const packedOverlap = packSkyline([
  { id: 'left', start: 0, end: 2, height: 120, sort: 1, tiebreak: 'left' },
  { id: 'right', start: 2, end: 4, height: 120, sort: 2, tiebreak: 'right' },
], 7, 8);
assert(packedOverlap[0].top === 0, 'first span at top');
assert(packedOverlap[1].top === 128, 'overlapping span waits for the shared column to free');

const packedSandwich = packSkyline([
  { id: 'one', start: 2, end: 2, height: 80, sort: 1, tiebreak: 'one' },
  { id: 'span', start: 2, end: 4, height: 90, sort: 2, tiebreak: 'span' },
  { id: 'two', start: 2, end: 2, height: 80, sort: 3, tiebreak: 'two' },
], 7, 0);
assert(packedSandwich[2].top === 170, 'later Pressing job packs below the span');

const packedQueueThenPress = packSkyline([
  { id: 'queue', start: 1, end: 1, height: 150, sort: 1, tiebreak: 'queue' },
  { id: 'press', start: 2, end: 2, height: 150, sort: 2, tiebreak: 'press' },
], 7, 0);
assert(packedQueueThenPress[0].top === 0 && packedQueueThenPress[1].top === 0, 'queue and pressing pack independently at the top');

if (process.exitCode) {
  console.error('dashboard pack tests failed');
  process.exit(1);
}
console.log('dashboard pack tests passed');
