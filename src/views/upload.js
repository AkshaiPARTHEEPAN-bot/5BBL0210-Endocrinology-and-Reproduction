import * as store from '../store.js';
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
    for (const file of files) {
      const title = file.name.replace(/\.(pptx|pdf)$/i, '').replace(/_+/g, ' ').trim();
      const msg = h('span', { class: 'status-msg' }, 'Reading slides…');
      const row = h('li', { class: 'status working' }, h('span', { class: 'status-name' }, title), msg);
      statusList.append(row);
      try {
        const { kind, slides, scanned } = await ai.readSlideFile(file);
        msg.textContent = `Read ${plural(slides.length, 'slide')}. Writing flashcards… (this can take a minute)`;
        const cards = await ai.generateCards(await ai.lectureInput({ title }, { file, slides, scanned }));
        const lecture = store.addLecture(title, { fileName: file.name, kind, slideCount: slides.length, scanned }, cards);
        await ai.saveSlideFile(lecture.id, file, slides);
        row.className = 'status ok';
        msg.replaceChildren(`✓ ${plural(cards.length, 'card')} from ${plural(slides.length, 'slide')} `, h('a', { href: `#/lecture/${lecture.id}` }, 'Open'));
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
    topbar('Upload lectures'),
    h('main', {},
      !settings.apiKey && h('p', { class: 'notice' }, 'You need a Claude API key first. ', h('a', { href: '#/settings' }, 'Open Settings'), '.'),
      input, drop,
      h('p', { class: 'muted small-text' }, 'Name your files like “Lecture 1 – Hormones.pdf” so they list in order. The slide text is sent to Claude, which writes 15–30 flashcards per lecture. Your files stay on this device.'),
      statusList,
    ),
  );
}
