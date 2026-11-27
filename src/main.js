import './style.css';
import * as store from './store.js';
import { schedule, isDueNow, isDueToday, describeNext, RED_REQUEUE_GAP, startOfDay, DAY } from './srs.js';
import { DEFAULT_MODEL } from './config.js';

// The slide reader and AI client are large, so they load only when uploading.
const loadUploadTools = () => Promise.all([import('./extract.js'), import('./ai.js')]);

const app = document.getElementById('app');

// ---------- tiny DOM helper (all user/AI text goes in via textContent) ----------
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const go = (hash) => { location.hash = hash; };
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function topbar(title, { back = '#/', right = null } = {}) {
  return h('header', { class: 'topbar' },
    back ? h('a', { class: 'icon-btn', href: back, 'aria-label': 'Back' }, '‹') : h('span', { class: 'icon-btn spacer' }),
    h('h1', {}, title),
    right || h('a', { class: 'icon-btn', href: '#/settings', 'aria-label': 'Settings' }, '⚙'),
  );
}

function render(...nodes) {
  app.replaceChildren(...nodes);
  window.scrollTo(0, 0);
}

function whenNext(cards) {
  const future = cards.filter((c) => !isDueNow(c)).map((c) => c.due);
  if (!future.length) return '';
  const next = Math.min(...future);
  const days = Math.round((startOfDay(next) - startOfDay(Date.now())) / DAY);
  if (days <= 0) {
    const mins = Math.max(1, Math.round((next - Date.now()) / 60000));
    return mins < 60 ? `next card in ${mins} min` : 'more cards later today';
  }
  return days === 1 ? 'next cards tomorrow' : `next cards in ${days} days`;
}

// ---------- Home ----------
function homeView() {
  const lectures = store.getLectures();
  const all = store.getCards();
  const dueNow = all.filter((c) => isDueNow(c)).length;
  const dueToday = all.filter((c) => isDueToday(c)).length;
  const hasKey = !!store.getSettings().apiKey;

  const list = lectures.map((l) => {
    const cards = store.getCards(l.id);
    const due = cards.filter((c) => isDueNow(c)).length;
    return h('li', { class: 'lecture' },
      h('a', { class: 'lecture-main', href: `#/lecture/${l.id}` },
        h('span', { class: 'lecture-title' }, l.title),
        h('span', { class: 'lecture-meta' },
          due ? h('strong', { class: 'due-pill' }, `${due} due`) : h('span', { class: 'done-pill' }, '✓ done'),
          ` · ${plural(cards.length, 'card')}`,
          !due && cards.length ? ` · ${whenNext(cards)}` : ''),
      ),
      h('button', { class: 'btn small', disabled: !due, onclick: () => go(`#/study/${l.id}`) }, 'Study'),
    );
  });

  render(
    topbar('Flashcards', { back: null }),
    h('main', {},
      h('section', { class: 'due-panel' },
        h('div', { class: 'due-number' }, String(dueToday)),
        h('div', { class: 'due-label' }, `${dueToday === 1 ? 'card' : 'cards'} due today`),
        dueNow
          ? h('button', { class: 'btn primary big', onclick: () => go('#/study/all') }, `Study all due (${dueNow})`)
          : h('p', { class: 'muted' }, all.length ? `Nothing due right now — ${whenNext(all) || 'all caught up'}.` : 'Upload a lecture to get started.'),
      ),
      !hasKey && h('p', { class: 'notice' }, 'To make flashcards you need a Claude API key. ', h('a', { href: '#/settings' }, 'Add it in Settings'), '.'),
      h('div', { class: 'section-head' },
        h('h2', {}, 'Lectures'),
        h('a', { class: 'btn small', href: '#/upload' }, '+ Upload'),
      ),
      lectures.length ? h('ul', { class: 'lectures' }, list)
        : h('a', { class: 'empty-upload', href: '#/upload' }, h('span', { class: 'plus' }, '+'), 'Upload lecture slides (.pptx or .pdf)'),
    ),
  );
}

// ---------- Upload ----------
function uploadView() {
  loadUploadTools(); // start fetching early
  const settings = store.getSettings();
  const statusList = h('ul', { class: 'status-list' });
  const input = h('input', { type: 'file', accept: '.pptx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation', multiple: true, id: 'file', class: 'visually-hidden' });
  const drop = h('label', { class: 'dropzone', for: 'file' },
    h('span', { class: 'plus' }, '+'),
    h('span', {}, 'Choose lecture slides'),
    h('span', { class: 'muted small-text' }, 'PowerPoint (.pptx) or PDF · you can pick several — one lecture per file'),
  );
  let busy = false;

  async function handle(files) {
    if (busy || !files.length) return;
    if (!store.getSettings().apiKey) { alert('Add your Claude API key in Settings first.'); go('#/settings'); return; }
    busy = true;
    drop.classList.add('disabled');
    const [{ extractSlides, slidesToText, wordCount }, { generateCards, friendlyError }] = await loadUploadTools();
    for (const file of files) {
      const title = file.name.replace(/\.(pptx|pdf)$/i, '').replace(/[_]+/g, ' ').trim();
      const msg = h('span', { class: 'status-msg' }, 'Reading slides…');
      const row = h('li', { class: 'status working' }, h('span', { class: 'status-name' }, title), msg);
      statusList.append(row);
      try {
        const { kind, slides } = await extractSlides(file);
        if (!slides.length) throw new Error('No slides found in this file.');
        const words = wordCount(slides);
        let pdfBase64 = null;
        if (words < 5 * slides.length) {
          if (kind === 'pdf' && file.size < 30 * 1024 * 1024) {
            pdfBase64 = await fileToBase64(file); // scanned slides: let Claude read the pages directly
          } else if (words < 20) {
            throw new Error('Hardly any text found on the slides (they may be images).');
          }
        }
        msg.textContent = `Read ${plural(slides.length, 'slide')}. Writing flashcards… (this can take a minute)`;
        const cards = await generateCards({
          apiKey: store.getSettings().apiKey,
          model: store.getSettings().model || DEFAULT_MODEL,
          title,
          text: slidesToText(slides),
          pdfBase64,
        });
        const lecture = store.addLecture(title, file.name, cards);
        row.className = 'status ok';
        msg.replaceChildren(`✓ ${plural(cards.length, 'card')} from ${plural(slides.length, 'slide')} `, h('a', { href: `#/lecture/${lecture.id}` }, 'View'));
      } catch (err) {
        console.error(err);
        row.className = 'status error';
        msg.textContent = friendlyError(err);
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
    topbar('Upload lecture'),
    h('main', {},
      !settings.apiKey && h('p', { class: 'notice' }, 'You need a Claude API key first. ', h('a', { href: '#/settings' }, 'Open Settings'), '.'),
      input, drop,
      h('p', { class: 'muted small-text' }, 'The text of every slide (and any speaker notes) is sent to Claude, which writes 15–30 cards per lecture. Your files stay on this device.'),
      statusList,
    ),
  );
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

// ---------- Edit dialog ----------
function editDialog({ title, question = '', answer = '', onSave, onDelete }) {
  const q = h('textarea', { rows: 3, value: question, placeholder: 'Question' });
  const a = h('textarea', { rows: 4, value: answer, placeholder: 'Answer' });
  const dlg = h('dialog', { class: 'dialog' },
    h('form', { method: 'dialog', onsubmit: (e) => {
      e.preventDefault();
      if (!q.value.trim() || !a.value.trim()) { alert('Both question and answer are needed.'); return; }
      onSave(q.value.trim(), a.value.trim());
      dlg.close();
    } },
      h('h2', {}, title),
      h('label', {}, 'Front (question)', q),
      h('label', {}, 'Back (answer)', a),
      h('div', { class: 'dialog-actions' },
        onDelete && h('button', { type: 'button', class: 'btn danger-outline', onclick: () => {
          if (confirm('Delete this card?')) { onDelete(); dlg.close(); }
        } }, 'Delete'),
        h('span', { class: 'grow' }),
        h('button', { type: 'button', class: 'btn', onclick: () => dlg.close() }, 'Cancel'),
        h('button', { type: 'submit', class: 'btn primary' }, 'Save'),
      ),
    ),
  );
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  q.focus();
}

// ---------- Lecture (card list) ----------
function dueLabel(c) {
  if (isDueNow(c)) return h('span', { class: 'due-pill' }, 'due');
  const days = Math.round((startOfDay(c.due) - startOfDay(Date.now())) / DAY);
  return h('span', { class: `tag ${c.lastRating || ''}` }, days <= 0 ? 'later today' : days === 1 ? 'tomorrow' : `in ${days} days`);
}

function lectureView(id) {
  const lecture = store.getLecture(id);
  if (!lecture) return go('#/');
  const cards = store.getCards(id).sort((a, b) => a.createdAt - b.createdAt);
  const due = cards.filter((c) => isDueNow(c)).length;
  const rerender = () => lectureView(id);

  render(
    topbar(lecture.title),
    h('main', {},
      h('div', { class: 'row-actions' },
        h('button', { class: 'btn primary', disabled: !due, onclick: () => go(`#/study/${id}`) }, due ? `Study ${due} due` : 'Nothing due'),
        h('button', { class: 'btn', onclick: () => editDialog({
          title: 'New card',
          onSave: (q, a) => { store.addCard(id, q, a); rerender(); },
        }) }, '+ Card'),
      ),
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
      h('div', { class: 'row-actions bottom' },
        h('button', { class: 'btn', onclick: () => {
          const t = prompt('Lecture name', lecture.title);
          if (t && t.trim()) { store.renameLecture(id, t.trim()); rerender(); }
        } }, 'Rename lecture'),
        h('button', { class: 'btn danger-outline', onclick: () => {
          if (confirm(`Delete “${lecture.title}” and all ${cards.length} cards? This can’t be undone.`)) { store.deleteLecture(id); go('#/'); }
        } }, 'Delete lecture'),
      ),
    ),
  );
}

// ---------- Study ----------
let session = null;

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

function studyView(scope) {
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
    topbar(title, { right: h('button', { class: 'icon-btn', 'aria-label': 'Edit card', onclick: () => editDialog({
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
  const { red, amber, green } = session.tally;
  const cards = store.getCards(scope === 'all' ? null : scope);
  const laterToday = cards.filter((c) => !isDueNow(c) && isDueToday(c)).length;
  session = null;
  render(
    topbar(title),
    h('main', { class: 'finished' },
      h('div', { class: 'big-check' }, '✓'),
      h('h2', {}, red + amber + green ? 'Session complete' : 'Nothing due'),
      red + amber + green ? h('div', { class: 'tally' },
        h('span', { class: 'tag red' }, `${red} red`),
        h('span', { class: 'tag amber' }, `${amber} amber`),
        h('span', { class: 'tag green' }, `${green} green`),
      ) : null,
      h('p', { class: 'muted' }, laterToday ? `${plural(laterToday, 'card')} will be back later today.` : (whenNext(cards) ? `${whenNext(cards)[0].toUpperCase()}${whenNext(cards).slice(1)}.` : '')),
      h('a', { class: 'btn primary big', href: '#/' }, 'Back to lectures'),
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

// ---------- Settings ----------
function settingsView() {
  const s = store.getSettings();
  const key = h('input', { type: 'password', value: s.apiKey || '', placeholder: 'sk-ant-…', autocomplete: 'off', spellcheck: false });
  const model = h('input', { type: 'text', value: s.model || '', placeholder: DEFAULT_MODEL, spellcheck: false });
  const saved = h('span', { class: 'saved-msg' });
  const importInput = h('input', { type: 'file', accept: '.json,application/json', class: 'visually-hidden', id: 'import' });
  importInput.addEventListener('change', async () => {
    const f = importInput.files[0];
    if (!f) return;
    if (!confirm('Replace all your current lectures, cards and progress with this backup?')) return;
    try { store.importData(await f.text()); alert('Backup restored.'); go('#/'); } catch (e) { alert(`Couldn’t restore: ${e.message}`); }
  });

  render(
    topbar('Settings'),
    h('main', { class: 'settings' },
      h('section', {},
        h('h2', {}, 'Claude API key'),
        h('p', { class: 'muted small-text' }, 'Used to write flashcards from your slides. Get one at console.anthropic.com. It is stored only in this browser and sent only to Anthropic.'),
        h('div', { class: 'key-row' }, key,
          h('button', { class: 'btn small', type: 'button', onclick: (e) => {
            key.type = key.type === 'password' ? 'text' : 'password';
            e.target.textContent = key.type === 'password' ? 'Show' : 'Hide';
          } }, 'Show')),
        h('details', {},
          h('summary', {}, 'Advanced'),
          h('label', { class: 'small-text' }, 'Model', model),
        ),
        h('div', { class: 'row-actions' },
          h('button', { class: 'btn primary', onclick: () => {
            store.saveSettings({ apiKey: key.value.trim(), model: model.value.trim() });
            saved.textContent = 'Saved ✓';
            setTimeout(() => (saved.textContent = ''), 2000);
          } }, 'Save'), saved),
      ),
      h('section', {},
        h('h2', {}, 'Your progress'),
        h('p', { class: 'muted small-text' }, 'Cards and ratings are saved automatically on this device. Download a backup to move them to another phone or browser.'),
        h('div', { class: 'row-actions' },
          h('button', { class: 'btn', onclick: () => {
            const blob = new Blob([store.exportData()], { type: 'application/json' });
            const a = h('a', { href: URL.createObjectURL(blob), download: `flashcards-backup-${new Date().toISOString().slice(0, 10)}.json` });
            document.body.append(a); a.click(); a.remove();
          } }, 'Download backup'),
          importInput,
          h('label', { class: 'btn', for: 'import' }, 'Restore backup'),
        ),
      ),
      h('section', {},
        h('h2', {}, 'How cards come back'),
        h('ul', { class: 'legend' },
          h('li', {}, h('span', { class: 'dot red' }), h('b', {}, 'Red'), ' – again later this session, then in 10 minutes'),
          h('li', {}, h('span', { class: 'dot amber' }), h('b', {}, 'Amber'), ' – tomorrow'),
          h('li', {}, h('span', { class: 'dot green' }), h('b', {}, 'Green'), ' – in 3 days, then 6, 12, 24… each green in a row'),
        ),
        h('p', { class: 'muted small-text' }, 'On a computer: Space flips the card, 1 / 2 / 3 rate it.'),
      ),
    ),
  );
}

// ---------- Router ----------
function route() {
  const [, view, arg] = (location.hash || '#/').split('/');
  if (view !== 'study') session = null;
  if (view === 'upload') uploadView();
  else if (view === 'study' && arg) studyView(arg);
  else if (view === 'lecture' && arg) lectureView(arg);
  else if (view === 'settings') settingsView();
  else homeView();
}

window.addEventListener('hashchange', route);
route();
