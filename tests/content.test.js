// Checks every built-in lecture is complete and well-formed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { expand } from '../src/content/helpers.js';

const dir = new URL('../src/content/', import.meta.url);
const files = readdirSync(dir).filter((f) => /^lecture-\d+.*\.js$/.test(f)).sort();
const lectures = await Promise.all(files.map(async (f) => expand((await import(new URL(f, dir))).default)));

test('lecture ids and numbers are unique', () => {
  assert.equal(new Set(lectures.map((l) => l.id)).size, lectures.length);
  assert.equal(new Set(lectures.map((l) => l.number)).size, lectures.length);
});

for (const l of lectures) {
  test(`${l.number}. ${l.title}`, () => {
    assert.ok(l.id.startsWith('builtin-'));
    assert.ok(l.cards.length >= 20, `${l.cards.length} cards`);
    for (const c of l.cards) assert.ok(c.question?.trim() && c.answer?.trim(), JSON.stringify(c));
    assert.ok(l.notes.summary && l.notes.sections.length >= 3);
    for (const s of l.notes.sections) assert.ok(s.heading && s.points.length, s.heading);
    for (const t of l.notes.key_terms) assert.ok(t.term && t.definition, JSON.stringify(t));
    for (const n of l.notes.key_numbers) assert.ok(n.value && n.meaning, JSON.stringify(n));
    assert.ok(l.quiz.length >= 20, `${l.quiz.length} questions`);
    for (const q of l.quiz) {
      assert.equal(q.options.length, 5, q.question);
      assert.equal(q.answer_index, 0);
      for (const o of q.options) assert.ok(o.text && o.why, `${q.question} → ${o.text}`);
      assert.equal(new Set(q.options.map((o) => o.text)).size, 5, `duplicate option in: ${q.question}`);
    }
  });
}
