import assert from 'node:assert/strict';
import {
  isRecordSizeChangeQuery,
  pageTitle,
  playbookForQuestion,
  retrieveManualPages,
} from '../lib/warmtone-manual/retrieve.ts';

const QUESTION =
  'changing a 12" mold to a 7" mold and what settings need to change';

assert.equal(isRecordSizeChangeQuery(QUESTION), true, 'size-change detector should fire');

const playbook = playbookForQuestion(QUESTION);
assert.ok(playbook, '12→7 playbook should attach');
assert.equal(playbook.id, 'size-change-12-to-7');
assert.match(playbook.text, /Load Job/);
assert.doesNotMatch(playbook.text, /\b(2300|80\.0|141\.4)\b/, 'must not paste install leak-check setpoints as the recipe');

const reverse = playbookForQuestion('swap 7 inch moulds back to 12" LP');
assert.equal(reverse?.id, 'size-change-7-to-12');

const pages = retrieveManualPages(QUESTION);
const nums = pages.map((page) => page.page);
const headings = pages.map((page) => `${page.page}:${page.heading}`);

console.log('Question:', QUESTION);
console.log('Playbook:', playbook.id);
console.log('Retrieved:');
for (const page of pages) {
  console.log(`  p.${page.page}  score=${page.score.toFixed(1)}  ${pageTitle(page)}`);
}

assert.ok(pages.length >= 4, 'should return several pages');
assert.ok(
  nums.some((n) => [104, 105, 106, 107, 108].includes(n)),
  `expected a mould install/remove page, got ${headings.join(', ')}`,
);
assert.ok(
  nums.some((n) => [99, 100].includes(n)),
  `expected changing/removing spindles, got ${headings.join(', ')}`,
);
assert.ok(
  nums.some((n) => [61, 62, 63, 68, 69].includes(n)),
  `expected job/process settings, got ${headings.join(', ')}`,
);
assert.ok(!nums.includes(78), 'Sequence Settings should not rank for a size-change');
assert.notEqual(nums[0], 78);
assert.ok(
  !pages.some((page) => /sequence settings/i.test(page.heading)),
  'no Sequence Settings heading in the hit list',
);

const moldQuery = retrieveManualPages('how do I take the molds off');
assert.ok(
  moldQuery.some((page) => [104, 105].includes(page.page)),
  `mold→mould should still find remove-moulds, got ${moldQuery.map((p) => p.page).join(', ')}`,
);

console.log('OK');
