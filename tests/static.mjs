import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const index = JSON.parse(await fs.readFile(new URL('references/tunes/index.json', root), 'utf8'));
assert.equal(index.count, 30);
assert.equal(index.tunes.length, 30);
for (const entry of index.tunes) {
  const profile = JSON.parse(await fs.readFile(new URL(`references/tunes/${entry.file}`, root), 'utf8'));
  assert.equal(profile.approvedFormatIndex, 0, entry.name);
  assert.ok(profile.format.Definition, entry.name);
  assert.ok(profile.format.SamplePunctuated, entry.name);
}
const rhyme = JSON.parse(await fs.readFile(new URL('references/rhyme/clzy.json', root), 'utf8'));
assert.equal(rhyme.Book, '词林正韵');
assert.ok(rhyme.Categories.length >= 19);
const api = JSON.parse(await fs.readFile(new URL('tests/fixtures/cnkgraph-validation-2026-07-31.json', root), 'utf8'));
assert.equal(api.positivePassed, 30);
assert.equal(api.negativePassed, 30);
console.log('static tests ok: 30 tunes, local rhyme data, 30 positive + 30 negative API fixtures');
