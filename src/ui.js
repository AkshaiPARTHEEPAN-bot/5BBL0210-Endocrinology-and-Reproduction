// Small shared UI helpers. All user/AI text is inserted via textContent (never innerHTML).
import { isDueNow, startOfDay, DAY } from './srs.js';

const app = () => document.getElementById('app');

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const go = (hash) => { location.hash = hash; };
export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Each render gets a token so a slow async view doesn't draw over a newer screen.
let renderToken = 0;
export const newToken = () => ++renderToken;
export const isCurrent = (t) => t === renderToken;

export function render(...nodes) {
  app().replaceChildren(...nodes);
  window.scrollTo(0, 0);
}

export function topbar(title, { back = '#/', right = null } = {}) {
  return h('header', { class: 'topbar' },
    back ? h('a', { class: 'icon-btn', href: back, 'aria-label': 'Back' }, '‹') : h('span', { class: 'icon-btn spacer' }),
    h('h1', {}, title),
    right || h('a', { class: 'icon-btn', href: '#/settings', 'aria-label': 'Settings' }, '⚙'),
  );
}

export function whenNext(cards) {
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

export const capitalise = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function loading(text) {
  return h('div', { class: 'loading' }, h('span', { class: 'spinner' }), h('span', {}, text));
}

export function editDialog({ title, question = '', answer = '', onSave, onDelete }) {
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

// Lazy-load the big modules (slide reader, pdf.js, Claude SDK) only when needed.
export const loadAI = () => Promise.all([import('./source.js'), import('./ai.js')]).then(([source, ai]) => ({ ...source, ...ai }));
