import * as store from '../store.js';
import { DEFAULT_MODEL } from '../config.js';
import { h, go, render, topbar } from '../ui.js';

// ---------- Settings ----------
export function settingsView() {
  const s = store.getSettings();
  const key = h('input', { type: 'password', value: s.apiKey || '', placeholder: 'sk-ant-…', autocomplete: 'off', spellcheck: false });
  const model = h('input', { type: 'text', value: s.model || '', placeholder: DEFAULT_MODEL, spellcheck: false });
  const saved = h('span', { class: 'saved-msg' });
  const importInput = h('input', { type: 'file', accept: '.json,application/json', class: 'visually-hidden', id: 'import' });
  importInput.addEventListener('change', async () => {
    const f = importInput.files[0];
    if (!f) return;
    if (!confirm('Replace all your current lectures, cards and progress with this backup?')) return;
    try { await store.importData(await f.text()); alert('Backup restored.'); go('#/'); } catch (e) { alert(`Couldn’t restore: ${e.message}`); }
  });

  render(
    topbar('Settings'),
    h('main', { class: 'settings' },
      h('section', {},
        h('h2', {}, 'Claude API key'),
        h('p', { class: 'muted small-text' }, 'Used to write flashcards, notes and quizzes for lectures you add. Get one at console.anthropic.com. It is stored only in this browser and sent only to Anthropic.'),
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
        h('h2', {}, 'New lectures'),
        h('p', { class: 'muted small-text' }, 'Add a lecture PDF or PowerPoint any time with “+ Add lecture” on the home page.'),
        h('label', { class: 'toggle' },
          h('input', { type: 'checkbox', checked: s.autoNotesQuiz !== false, onchange: (e) => store.saveSettings({ autoNotesQuiz: e.target.checked }) }),
          h('span', {}, h('b', {}, 'Write notes and quiz automatically'), h('br'), h('span', { class: 'muted small-text' }, 'When on, each new lecture gets flashcards, revision notes and a 20-question quiz straight away. When off, only flashcards are made and notes/quiz are written when you first open them (uses less API credit).')),
        ),
        h('a', { class: 'btn primary', href: '#/upload' }, '+ Add lecture'),
      ),
      h('section', {},
        h('h2', {}, 'Your progress'),
        h('p', { class: 'muted small-text' }, 'Lectures, flashcards, ratings, notes and quizzes are saved automatically on this device. Download a backup to move them to another phone or browser (slide files aren’t included — re-add them on each lecture page).'),
        h('div', { class: 'row-actions' },
          h('button', { class: 'btn', onclick: async () => {
            const blob = new Blob([await store.exportData()], { type: 'application/json' });
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

