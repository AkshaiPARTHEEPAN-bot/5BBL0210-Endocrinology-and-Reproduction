import * as store from '../store.js';
import { isDueNow, isDueToday } from '../srs.js';
import { h, go, render, topbar, plural, whenNext } from '../ui.js';

export function homeView() {
  const lectures = store.getLectures();
  const all = store.getCards();
  const dueNow = all.filter((c) => isDueNow(c)).length;
  const dueToday = all.filter((c) => isDueToday(c)).length;
  const hasKey = !!store.getSettings().apiKey;

  const list = lectures.map((l) => {
    const cards = store.getCards(l.id);
    const due = cards.filter((c) => isDueNow(c)).length;
    return h('li', {},
      h('a', { class: 'lecture', href: `#/lecture/${l.id}` },
        h('span', { class: `lecture-num${l.number == null ? ' none' : ''}`, 'aria-hidden': 'true' }, l.number ?? '–'),
        h('span', { class: 'lecture-main' },
          h('span', { class: 'lecture-title' }, l.title),
          h('span', { class: 'lecture-meta' },
            due ? h('strong', { class: 'due-pill' }, `${due} due`) : h('span', { class: 'done-pill' }, '✓ up to date'),
            ` · ${plural(cards.length, 'card')}`),
        ),
        h('span', { class: 'chevron', 'aria-hidden': 'true' }, '›'),
      ),
    );
  });

  render(
    topbar('My Lectures', { back: null }),
    h('main', {},
      h('section', { class: 'due-panel' },
        h('div', { class: 'due-number' }, String(dueToday)),
        h('div', { class: 'due-label' }, `flashcard${dueToday === 1 ? '' : 's'} due today`),
        dueNow
          ? h('button', { class: 'btn primary big', onclick: () => go('#/study/all') }, `Study all due (${dueNow})`)
          : h('p', { class: 'muted' }, all.length ? `Nothing due right now — ${whenNext(all) || 'all caught up'}.` : 'Upload a lecture to get started.'),
      ),
      !hasKey && h('p', { class: 'notice' }, lectures.length ? 'To make flashcards, notes and quizzes for new lectures you need a Claude API key. ' : 'To make flashcards, notes and quizzes you need a Claude API key. ', h('a', { href: '#/settings' }, 'Add it in Settings'), '.'),
      h('div', { class: 'section-head' },
        h('h2', {}, lectures.length ? `Lectures (${lectures.length})` : 'Lectures'),
        h('a', { class: 'btn small', href: '#/upload' }, '+ Upload'),
      ),
      lectures.length ? h('ul', { class: 'lectures' }, list)
        : h('a', { class: 'empty-upload', href: '#/upload' }, h('span', { class: 'plus' }, '+'), 'Upload lecture slides (.pptx or .pdf)'),
    ),
  );
}
