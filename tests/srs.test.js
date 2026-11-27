import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schedule, newCardState, startOfDay, DAY, RED_DELAY, isDueNow, isDueToday } from '../src/srs.js';

const now = new Date(2026, 10, 27, 14, 30).getTime();
const dayStart = (n) => { const d = new Date(startOfDay(now)); d.setDate(d.getDate() + n); return d.getTime(); };

test('new cards are due now', () => {
  const c = newCardState(now);
  assert.ok(isDueNow(c, now));
});

test('red comes back in 10 minutes, still due today', () => {
  const c = schedule(newCardState(now), 'red', now);
  assert.equal(c.due, now + RED_DELAY);
  assert.ok(!isDueNow(c, now));
  assert.ok(isDueToday(c, now));
});

test('amber is due tomorrow', () => {
  const c = schedule(newCardState(now), 'amber', now);
  assert.equal(c.due, dayStart(1));
  assert.ok(!isDueToday(c, now));
});

test('green: 3 days, then doubles on consecutive greens', () => {
  let c = schedule(newCardState(now), 'green', now);
  assert.equal(c.interval, 3);
  assert.equal(c.due, dayStart(3));
  c = schedule(c, 'green', now);
  assert.equal(c.interval, 6);
  c = schedule(c, 'green', now);
  assert.equal(c.interval, 12);
  assert.equal(c.due, dayStart(12));
});

test('a non-green rating resets the green streak', () => {
  let c = schedule(newCardState(now), 'green', now);
  c = schedule(c, 'green', now); // 6
  c = schedule(c, 'amber', now);
  assert.equal(c.interval, 1);
  c = schedule(c, 'green', now);
  assert.equal(c.interval, 3);
  c = schedule(c, 'red', now);
  c = schedule(c, 'green', now);
  assert.equal(c.interval, 3);
});

test('rejects unknown ratings', () => {
  assert.throws(() => schedule(newCardState(now), 'blue', now));
});
