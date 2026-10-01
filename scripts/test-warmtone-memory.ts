import assert from 'node:assert/strict';
import {
  mergeMachineNotes,
  parseMachineNotes,
  pruneHelpMemory,
  splitNotesFooter,
} from '../lib/warmtone-manual/memory.ts';

const split = splitNotesFooter(`1. Cool the moulds (Manual p.104).

<!--norp-notes
- Fulton backup boiler is down
- 7-inch job is named 7IN-BLACK
-->`);
assert.match(split.answer, /Cool the moulds/);
assert.doesNotMatch(split.answer, /norp-notes/);
assert.deepEqual(split.notes, ['Fulton backup boiler is down', '7-inch job is named 7IN-BLACK']);

assert.deepEqual(splitNotesFooter('No footer here.').notes, []);

const merged = mergeMachineNotes(
  ['Fulton backup boiler is down'],
  ['Fulton backup boiler is down', '  Ersteel HPU  ', 'no'],
);
assert.deepEqual(merged, ['Fulton backup boiler is down', 'Ersteel HPU']);

assert.deepEqual(parseMachineNotes(['saved job 7IN-BLACK', 12, '']), ['saved job 7IN-BLACK']);

const pruned = pruneHelpMemory({
  version: 1,
  updatedAt: '2026-10-01T00:00:00.000Z',
  machineNotes: ['Keep this plant note about PRS00007'],
  messages: [
    { id: 'u1', role: 'user', content: 'Fault 1105' },
    { id: 'a1', role: 'assistant', content: 'Check 24V.' },
  ],
});
assert.equal(pruned.messages.length, 2);
assert.equal(pruned.machineNotes.length, 1);

console.log('memory tests OK');
