import * as store from '../store.js';
import * as idb from '../idb.js';
import { h, go, render, topbar, plural, loadAI } from '../ui.js';

export function uploadView() {
  loadAI(); // start downloading early
  const settings = store.getSettings();
  const statusList = h('ul', { class: 'status-list' });
  const input = h('input', { type: 'file', accept: '.pptx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation', multiple: true, id: 'file', class: 'visually-hidden' });
  const drop = h('label', { class: 'dropzone', for: 'file' },
    h('span', { class: 'plus' }, '+'),
    h('span', {}, 'Choose lecture slides'),
    h('span', { class: 'muted small-text' }, 'PowerPoint (.pptx) or PDF · pick several at once — one lecture per file'),
  );
  let busy = false;

  async function handle(files) {
    if (busy || !files.length) return;
    if (!store.getSettings().apiKey) { alert('Add your Claude API key in Settings first.'); go('#/settings'); return; }
    busy = true;
    drop.classList.add('disabled');
    const ai = await loadAI();
    const auto = store.getSettings().autoNotesQuiz !== false;
    for (const file of files) {
      const number = store.guessNumber(file.name) ?? store.nextNumber();
      const title = `${store.cleanTitle(file.name)} – Lecture ${store.numberWord(number)}`;
      const msg = h('span', { class: 'status-msg' }, 'Reading slides…');
      const row = h('li', { class: 'status working' }, h('span', { class: 'status-name' }, title), msg);
      statusList.append(row);
      try {
        const { kind, slides, scanned } = await ai.readSlideFile(file);
        msg.textContent = `Read ${plural(slides.length, 'slide')}. Writing ${auto ? 'flashcards, notes and quiz' : 'flashcards'}… (1–3 minutes)`;
        const input = await ai.lectureInput({ title }, { file, slides, scanned });
        // Write all three at the same time; flashcards are required, notes/quiz are a bonus.
        const [cards, notes, quiz] = await Promise.allSettled([
          ai.generateCards(input),
          auto ? ai.generateNotes(input) : Promise.resolve(null),
          auto ? ai.generateQuiz(input) : Promise.resolve(null),
        ]);
        if (cards.status === 'rejected') throw cards.reason;
        const lecture = store.addLecture(title, { number, fileName: file.name, kind, slideCount: slides.length, scanned }, cards.value);
        await ai.saveSlideFile(lecture.id, file, slides);
        const now = Date.now();
        if (notes.status === 'fulfilled' && notes.value) await idb.set(idb.K.notes(lecture.id), { ...notes.value, createdAt: now });
        if (quiz.status === 'fulfilled' && quiz.value) await idb.set(idb.K.quiz(lecture.id), { questions: quiz.value, createdAt: now, lastScore: null });
        const made = [plural(cards.value.length, 'flashcard'),
          notes.status === 'fulfilled' && notes.value && 'notes',
          quiz.status === 'fulfilled' && quiz.value && `${quiz.value.length}-question quiz`].filter(Boolean);
        const failed = auto && [notes.status === 'rejected' && 'notes', quiz.status === 'rejected' && 'quiz'].filter(Boolean);
        row.className = 'status ok';
        msg.replaceChildren(...[
          `✓ ${made.join(', ')} `,
          h('a', { href: `#/lecture/${lecture.id}` }, 'Open'),
          failed?.length ? h('span', { class: 'status-warn' }, ` — couldn’t write the ${failed.join(' or ')} (${ai.friendlyError((notes.reason || quiz.reason))}); you can make ${failed.length > 1 ? 'them' : 'it'} from the lecture page.`) : null,
        ].filter(Boolean));
      } catch (err) {
        console.error(err);
        row.className = 'status error';
        msg.textContent = ai.friendlyError(err);
      }
    }
    busy = false;
    drop.classList.remove('disabled');
    input.value = '';
    statusList.append(h('li', { class: 'status-done' }, h('a', { class: 'btn primary', href: '#/' }, 'Done')));
  }

  input.addEventListener('change', () => handle([...input.files]));
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); handle([...e.dataTransfer.files]); });

  render(
    topbar('Add lectures'),
    h('main', {},
      !settings.apiKey && h('p', { class: 'notice' }, 'You need a Claude API key first. ', h('a', { href: '#/settings' }, 'Open Settings'), '.'),
      input, drop,
      h('p', { class: 'muted small-text' },
        store.getSettings().autoNotesQuiz !== false
          ? 'Claude reads every slide and writes flashcards, revision notes and a 20-question exam-style quiz for each lecture. '
          : 'Claude reads every slide and writes flashcards for each lecture (notes and quiz are made when you open them — change this in Settings). ',
        `New lectures are numbered after your last one (next: ${store.nextNumber()}); change it on the lecture page if needed. Your files stay on this device.`),
      statusList,
    ),
  );
}
