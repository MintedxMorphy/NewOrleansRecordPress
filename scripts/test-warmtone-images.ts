import assert from 'node:assert/strict';
import { imageDataUrl, parseHelpImages } from '../lib/warmtone-manual/images.ts';

const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

assert.deepEqual(parseHelpImages(null), []);
assert.deepEqual(parseHelpImages({ mimeType: 'image/png', data: TINY_PNG }), []);

const parsed = parseHelpImages([
  { mimeType: 'image/png', data: TINY_PNG },
  { mimeType: 'image/png; charset=binary', data: `data:image/png;base64,${TINY_PNG}` },
  { mimeType: 'image/svg+xml', data: TINY_PNG },
  { mimeType: 'image/jpeg', data: '   ' },
]);
assert.equal(parsed.length, 2);
assert.equal(parsed[0].mimeType, 'image/png');
assert.equal(parsed[0].data, TINY_PNG);
assert.equal(parsed[1].data, TINY_PNG);
assert.match(imageDataUrl(parsed[0]), /^data:image\/png;base64,/);

const capped = parseHelpImages([
  { mimeType: 'image/png', data: TINY_PNG },
  { mimeType: 'image/png', data: TINY_PNG },
  { mimeType: 'image/png', data: TINY_PNG },
  { mimeType: 'image/png', data: TINY_PNG },
]);
assert.equal(capped.length, 3);

const tooBig = 'A'.repeat(2_000_000);
assert.equal(parseHelpImages([{ mimeType: 'image/jpeg', data: tooBig }]).length, 0);

console.log('image parse OK');
