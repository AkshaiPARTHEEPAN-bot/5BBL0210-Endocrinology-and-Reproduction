import * as store from '../store.js';
import * as idb from '../idb.js';
import { isDueNow, startOfDay, DAY } from '../srs.js';
import { h, go, render, topbar, plural, editDialog, loadAI, newToken, isCurrent } from '../ui.js';

// ---------- Lecture page: Slides / Notes / Flashcards / Quiz ----------
export async function lectureHubView(id) {
  const lecture = store.getLecture(id);
  if (!lecture) return go('#/');
  const token = newToken();
  const [slides, notes, quiz] = await Promise.all([idb.get(idb.K.slides(id)), idb.get(idb.K.notes(id)), idb.get(idb.K.quiz(id))]);
  if (!isCurrent(token)) return;

  const cards = store.getCards(id);
  const due = cards.filter((c) => isDueNow(c)).length;
  const hasSlides = !!slides;

  const tile = (href, icon, label, sub, cls = '') =>
    h('a', { class: `tile ${cls}`, href },
      h('span', { class: 'tile-icon', 'aria-hidden': 'true' }, icon),
      h('span', { class: 'tile-label' }, label),
      h('span', { class: 'tile-sub' }, sub),
    );

  const fileInput = h('input', { type: 'file', accept: '.pptx,.pdf', id: 'attach', class: 'visually-hidden' });
  const attachMsg = h('p', { class: 'muted small-text' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    attachMsg.textContent = 'Reading slides…';
    const ai = await loadAI();
    try {
      const { kind, slides: s, scanned } = await ai.readSlideFile(file);
      await ai.saveSlideFile(id, file, s);
      // Notes and quiz came from the old file, so clear them.
      await idb.del(idb.K.notes(id));
      await idb.del(idb.K.quiz(id));
      store.updateLecture(id, { fileName: file.name, kind, slideCount: s.length, scanned });
      lectureHubView(id);
    } catch (e) {
      attachMsg.textContent = ai.friendlyError(e);
    }
  });

  render(
    topbar(lecture.title),
    h('main', {},
      h('p', { class: 'lecture-sub muted' },
        [hasSlides && plural(slides.length, 'slide'), plural(cards.length, 'flashcard')].filter(Boolean).join(' · ')),
      !hasSlides && h('div', { class: 'notice' },
        h('p', {}, 'The slide file for this lecture isn’t saved on this device, so Slides, Notes and Quiz need it adding again. Your flashcards are kept.'),
        h('label', { class: 'btn small', for: 'attach' }, 'Add slide file'),
      ),
      h('div', { class: 'tiles' },
        tile(`#/lecture/${id}/slides`, '🖼️', 'Slides', hasSlides ? plural(slides.length, 'slide') : 'Add file first', hasSlides ? 'slides' : 'slides disabled'),
        tile(`#/lecture/${id}/notes`, '📝', 'Notes', notes ? 'Ready to read' : 'Tap to create', hasSlides || notes ? 'notes' : 'notes disabled'),
        tile(`#/lecture/${id}/cards`, '🃏', 'Flashcards', due ? `${due} due now` : `${plural(cards.length, 'card')} · up to date`, `cards${due ? ' has-due' : ''}`),
        tile(`#/lecture/${id}/quiz`, '❓', 'Quiz',
          quiz?.lastScore ? `Last score ${quiz.lastScore.correct}/${quiz.lastScore.total}` : quiz ? plural(quiz.questions.length, 'question') : 'Tap to create',
          hasSlides || quiz ? 'quiz' : 'quiz disabled'),
      ),
      due ? h('button', { class: 'btn primary big', onclick: () => go(`#/study/${id}`) }, `Study ${due} due flashcard${due === 1 ? '' : 's'}`) : null,
      h('div', { class: 'row-actions bottom' },
        fileInput,
        h('button', { class: 'btn', onclick: () => {
          const t = prompt('Lecture name', lecture.title);
          if (t && t.trim()) { store.updateLecture(id, { title: t.trim() }); lectureHubView(id); }
        } }, 'Rename'),
        hasSlides && h('label', { class: 'btn', for: 'attach' }, 'Replace slide file'),
        h('button', { class: 'btn danger-outline', onclick: async () => {
          if (confirm(`Delete “${lecture.title}” with its ${plural(cards.length, 'flashcard')}, notes and quiz? This can’t be undone.`)) {
            await store.deleteLecture(id);
            go('#/');
          }
        } }, 'Delete lecture'),
      ),
      attachMsg,
    ),
  );
}

// ---------- Flashcard list ----------
function dueLabel(c) {
  if (isDueNow(c)) return h('span', { class: 'due-pill' }, 'due');
  const days = Math.round((startOfDay(c.due) - startOfDay(Date.now())) / DAY);
  return h('span', { class: `tag ${c.lastRating || ''}` }, days <= 0 ? 'later today' : days === 1 ? 'tomorrow' : `in ${days} days`);
}

export function cardsView(id) {
  const lecture = store.getLecture(id);
  if (!lecture) return go('#/');
  const cards = store.getCards(id).sort((a, b) => a.createdAt - b.createdAt);
  const due = cards.filter((c) => isDueNow(c)).length;
  const rerender = () => cardsView(id);

  render(
    topbar('Flashcards', { back: `#/lecture/${id}` }),
    h('main', {},
      h('p', { class: 'lecture-sub muted' }, lecture.title),
      h('div', { class: 'row-actions' },
        h('button', { class: 'btn primary', disabled: !due, onclick: () => go(`#/study/${id}`) }, due ? `Study ${due} due` : 'Nothing due'),
        h('button', { class: 'btn', onclick: () => editDialog({
          title: 'New card',
          onSave: (q, a) => { store.addCard(id, q, a); rerender(); },
        }) }, '+ Card'),
      ),
      h('p', { class: 'muted small-text' }, 'Tap a card to edit or delete it.'),
      h('ul', { class: 'cards' }, cards.map((c, i) =>
        h('li', { class: 'card-row' },
          h('button', { class: 'card-row-btn', onclick: () => editDialog({
            title: 'Edit card', question: c.question, answer: c.answer,
            onSave: (q, a) => { store.updateCard(c.id, { question: q, answer: a }); rerender(); },
            onDelete: () => { store.deleteCard(c.id); rerender(); },
          }) },
            h('span', { class: 'card-row-top' }, h('span', { class: 'muted' }, `#${i + 1}`), dueLabel(c), h('span', { class: 'edit-hint' }, 'Edit ✎')),
            h('span', { class: 'card-q' }, c.question),
            h('span', { class: 'card-a' }, c.answer),
          ),
        ))),
      !cards.length && h('p', { class: 'muted' }, 'No cards in this lecture.'),
    ),
  );
}
