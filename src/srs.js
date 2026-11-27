// Spaced-repetition rules.
//   Red   -> back later in this session, and due again in ~10 minutes
//   Amber -> due again in ~1 day
//   Green -> due in 3 days; each consecutive green doubles the gap (3, 6, 12, 24...)

export const MINUTE = 60 * 1000;
export const DAY = 24 * 60 * MINUTE;
export const RED_DELAY = 10 * MINUTE;
export const RED_REQUEUE_GAP = 3; // cards shown before a red card comes back in-session

export function startOfDay(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function endOfDay(t) {
  return startOfDay(t) + DAY - 1;
}

// Due "on day N" = from the start of that calendar day, so a card set for
// tomorrow is ready first thing tomorrow, not at the exact minute.
function daysFromToday(now, days) {
  const d = new Date(startOfDay(now));
  d.setDate(d.getDate() + days);
  return d.getTime();
}

export function newCardState(now = Date.now()) {
  return { due: now, interval: 0, lastRating: null, reviews: 0 };
}

export function schedule(card, rating, now = Date.now()) {
  const next = { ...card, reviews: (card.reviews || 0) + 1, lastRating: rating, lastReviewed: now };
  if (rating === 'red') {
    next.interval = 0;
    next.due = now + RED_DELAY;
  } else if (rating === 'amber') {
    next.interval = 1;
    next.due = daysFromToday(now, 1);
  } else if (rating === 'green') {
    next.interval = card.lastRating === 'green' && card.interval >= 3 ? card.interval * 2 : 3;
    next.due = daysFromToday(now, next.interval);
  } else {
    throw new Error(`Unknown rating: ${rating}`);
  }
  return next;
}

export const isDueNow = (card, now = Date.now()) => card.due <= now;
export const isDueToday = (card, now = Date.now()) => card.due <= endOfDay(now);

export function describeNext(card, rating) {
  if (rating === 'red') return 'again soon';
  if (rating === 'amber') return '1 day';
  const n = card.lastRating === 'green' && card.interval >= 3 ? card.interval * 2 : 3;
  return `${n} days`;
}
