import * as store from '../store.js';
import * as idb from '../idb.js';
import { h, go, render, topbar, loading, loadAI, newToken, isCurrent } from '../ui.js';

export async function notesView(id) {
  const lecture = store.getLecture(id);
  if (!lecture) return go('#/');
  const token = newToken();
  const back = `#/lecture/${id}`;
  const notes = await idb.get(idb.K.notes(id));
  if (!isCurrent(token)) return;

  const status = h('div', {});
  async function create() {
    status.replaceChildren(loading('Claude is writing your notes… (about a minute)'));
    const ai = await loadAI();
    try {
      const result = await ai.generateNotes(await ai.lectureInput(lecture));
      await idb.set(idb.K.notes(id), { ...result, createdAt: Date.now() });
      if (isCurrent(token)) notesView(id);
    } catch (e) {
      console.error(e);
      status.replaceChildren(h('p', { class: 'error-msg' }, ai.friendlyError(e)), h('button', { class: 'btn primary big', onclick: create }, 'Try again'));
    }
  }

  if (!notes) {
    status.append(h('button', { class: 'btn primary big', onclick: create }, 'Write notes'));
    render(
      topbar('Notes', { back }),
      h('main', { class: 'empty-state' },
        h('div', { class: 'empty-icon' }, '📝'),
        h('h2', {}, lecture.title),
        h('p', { class: 'muted' }, 'Claude will turn this lecture’s slides into revision notes: a summary, each topic as bullet points, key terms and key numbers.'),
        status,
      ),
    );
    return;
  }

  render(
    topbar('Notes', { back }),
    h('main', { class: 'notes' },
      h('h2', { class: 'notes-title' }, lecture.title),
      h('section', { class: 'notes-summary' }, h('h3', {}, 'Summary'), h('p', {}, notes.summary)),
      notes.sections.map((s) => h('section', { class: 'notes-section' },
        h('h3', {}, s.heading),
        h('ul', {}, s.points.map((p) => h('li', {}, p))),
      )),
      notes.key_terms?.length ? h('section', { class: 'notes-section' },
        h('h3', {}, 'Key terms'),
        h('dl', { class: 'terms' }, notes.key_terms.map((t) => [h('dt', {}, t.term), h('dd', {}, t.definition)])),
      ) : null,
      notes.key_numbers?.length ? h('section', { class: 'notes-section' },
        h('h3', {}, 'Key numbers'),
        h('ul', { class: 'numbers' }, notes.key_numbers.map((n) => h('li', {}, h('span', { class: 'num' }, n.value), h('span', {}, n.meaning)))),
      ) : null,
      h('p', { class: 'muted small-text' }, 'Written by Claude from your slides — check anything that looks off against the lecture.'),
      status,
      h('button', { class: 'btn', onclick: () => { if (confirm('Replace these notes with a new version?')) create(); } }, 'Rewrite notes'),
    ),
  );
}
