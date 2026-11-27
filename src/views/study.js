import * as store from '../store.js';
import { schedule, isDueNow, isDueToday, describeNext, RED_REQUEUE_GAP, startOfDay } from '../srs.js';
import { h, go, render, topbar, plural, whenNext, capitalise, editDialog } from '../ui.js';

// ---------- Study ----------
let session = null;
export const endSession = () => { session = null; };

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function startSession(scope) {
  const lectureId = scope === 'all' ? null : scope;
  const due = store.getCards(lectureId).filter((c) => isDueNow(c));
  // Overdue reviews first (oldest first), new cards after, mixed up within each group.
  const reviews = shuffle(due.filter((c) => c.reviews > 0)).sort((a, b) => startOfDay(a.due) - startOfDay(b.due));
  const fresh = shuffle(due.filter((c) => !c.reviews));
  session = { scope, queue: [...reviews, ...fresh].map((c) => c.id), done: 0, tally: { red: 0, amber: 0, green: 0 }, current: null, flipped: false };
}

export function studyView(scope) {
  if (!session || session.scope !== scope) startSession(scope);
  const lecture = scope === 'all' ? null : store.getLecture(scope);
  if (scope !== 'all' && !lecture) return go('#/');
  const title = lecture ? lecture.title : 'All lectures';

  // Skip cards deleted mid-session.
  while (session.queue.length && !store.getCard(session.queue[0])) session.queue.shift();
  if (!session.queue.length) return finishedView(title, scope);

  const card = store.getCard(session.queue[0]);
  const lectureName = scope === 'all' ? store.getLecture(card.lectureId)?.title : null;
  const remaining = new Set(session.queue).size;
  const total = session.done + remaining;

  const cardEl = h('button', { class: `flashcard${session.flipped ? ' flipped' : ''}`, 'aria-label': 'Flip card', onclick: () => flip() },
    h('div', { class: 'flash-inner' },
      h('div', { class: 'face front' },
        h('span', { class: 'face-label' }, 'Question'),
        h('span', { class: 'face-text' }, card.question),
        h('span', { class: 'tap-hint' }, 'Tap to show answer'),
      ),
      h('div', { class: 'face back' },
        h('span', { class: 'face-label' }, 'Answer'),
        h('span', { class: 'face-q' }, card.question),
        h('span', { class: 'face-text' }, card.answer),
      ),
    ),
  );

  const rateBtn = (rating, label) => h('button', { class: `rate ${rating}`, onclick: () => rate(rating) },
    h('span', { class: 'rate-label' }, label),
    h('span', { class: 'rate-sub' }, describeNext(card, rating)),
  );
  const ratings = h('div', { class: `ratings${session.flipped ? ' show' : ''}` },
    rateBtn('red', 'Didn’t get it'),
    rateBtn('amber', 'Kind of'),
    rateBtn('green', 'Got it'),
  );

  function flip() {
    session.flipped = !session.flipped;
    cardEl.classList.toggle('flipped', session.flipped);
    ratings.classList.toggle('show', session.flipped);
  }

  function rate(rating) {
    if (!session.flipped) return;
    store.updateCard(card.id, schedule(card, rating));
    session.queue.shift();
    session.tally[rating]++;
    if (rating === 'red') {
      // Show it again later in this session.
      session.queue.splice(Math.min(RED_REQUEUE_GAP, session.queue.length), 0, card.id);
    } else if (!session.queue.includes(card.id)) {
      session.done++;
    }
    session.flipped = false;
    studyView(scope);
  }

  render(
    topbar(title, { back: scope === 'all' ? '#/' : `#/lecture/${scope}`, right: h('button', { class: 'icon-btn', 'aria-label': 'Edit card', onclick: () => editDialog({
      title: 'Edit card', question: card.question, answer: card.answer,
      onSave: (q, a) => { store.updateCard(card.id, { question: q, answer: a }); studyView(scope); },
      onDelete: () => { store.deleteCard(card.id); session.queue = session.queue.filter((x) => x !== card.id); session.flipped = false; studyView(scope); },
    }) }, '✎') }),
    h('main', { class: 'study' },
      h('div', { class: 'progress' },
        h('div', { class: 'progress-bar' }, h('div', { class: 'progress-fill', style: `width:${total ? (session.done / total) * 100 : 0}%` })),
        h('span', { class: 'progress-text' }, `${remaining} left`),
      ),
      lectureName && h('p', { class: 'card-lecture' }, lectureName),
      cardEl,
      ratings,
    ),
  );
}

function finishedView(title, scope) {
  const back = scope === 'all' ? '#/' : `#/lecture/${scope}`;
  const { red, amber, green } = session.tally;
  const cards = store.getCards(scope === 'all' ? null : scope);
  const laterToday = cards.filter((c) => !isDueNow(c) && isDueToday(c)).length;
  session = null;
  render(
    topbar(title, { back }),
    h('main', { class: 'finished' },
      h('div', { class: 'big-check' }, '✓'),
      h('h2', {}, red + amber + green ? 'Session complete' : 'Nothing due'),
      red + amber + green ? h('div', { class: 'tally' },
        h('span', { class: 'tag red' }, `${red} red`),
        h('span', { class: 'tag amber' }, `${amber} amber`),
        h('span', { class: 'tag green' }, `${green} green`),
      ) : null,
      h('p', { class: 'muted' }, laterToday ? `${plural(laterToday, 'card')} will be back later today.` : (whenNext(cards) ? `${capitalise(whenNext(cards))}.` : '')),
      h('a', { class: 'btn primary big', href: back }, scope === 'all' ? 'Back to lectures' : 'Back to lecture'),
    ),
  );
}

document.addEventListener('keydown', (e) => {
  if (!location.hash.startsWith('#/study/') || document.querySelector('dialog[open]')) return;
  const card = document.querySelector('.flashcard');
  if (!card) return;
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); card.click(); }
  const map = { 1: 'red', 2: 'amber', 3: 'green' };
  if (map[e.key] && session?.flipped) document.querySelector(`.rate.${map[e.key]}`)?.click();
});

