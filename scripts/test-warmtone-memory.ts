import assert from 'node:assert/strict';
import {
  mergeHelpMessages,
  mergeMachineNotes,
  parseHelpMemory,
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

const parsed = parseHelpMemory({
  version: 1,
  messages: [
    { id: 'u1', role: 'user', content: 'Edge trimmer' },
    { role: 'assistant', content: 'missing id' },
  ],
  machineNotes: ['Integrated trimmer on PRS00007'],
});
assert.equal(parsed.messages.length, 1);
assert.equal(parsed.messages[0].id, 'u1');

const combined = mergeHelpMessages(parsed.messages, [
  { id: 'u1', role: 'user', content: 'duplicate' },
  { id: 'a2', role: 'assistant', content: 'Check the proximity switch.' },
]);
assert.equal(combined.length, 2);
assert.equal(combined[1].id, 'a2');

console.log('memory tests OK');
