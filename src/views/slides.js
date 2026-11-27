import * as store from '../store.js';
import * as idb from '../idb.js';
import { h, go, render, topbar, loading, newToken, isCurrent } from '../ui.js';

let objectUrl = null;

export async function slidesView(id) {
  const lecture = store.getLecture(id);
  if (!lecture) return go('#/');
  const token = newToken();
  const back = `#/lecture/${id}`;
  render(topbar('Slides', { back }), h('main', {}, loading('Loading slides…')));

  const [fileRec, slides] = await Promise.all([idb.get(idb.K.file(id)), idb.get(idb.K.slides(id))]);
  if (!isCurrent(token)) return;
  if (!slides) return go(back);

  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = fileRec ? URL.createObjectURL(fileRec.blob) : null;
  const isPdf = fileRec && /\.pdf$/i.test(fileRec.name);

  const openBtn = objectUrl && h('a', {
    class: 'btn small', href: objectUrl, target: '_blank', rel: 'noopener',
    download: isPdf ? null : fileRec.name,
  }, isPdf ? 'Open PDF' : 'Open in PowerPoint');

  const list = h('div', { class: 'slides' });
  render(
    topbar('Slides', { back }),
    h('main', {},
      h('div', { class: 'slides-head' }, h('p', { class: 'lecture-sub muted' }, lecture.title), openBtn),
      !isPdf && h('p', { class: 'muted small-text' }, 'PowerPoint slides can’t be drawn in the browser, so this shows the text of each slide. Tap “Open in PowerPoint” to see the real slides.'),
      list,
    ),
  );

  if (isPdf) await renderPdf(fileRec.blob, list, token);
  else renderText(slides, list);
}

function renderText(slides, list) {
  for (const s of slides) {
    list.append(h('section', { class: 'slide-text' },
      h('span', { class: 'slide-num' }, `Slide ${s.number}`),
      h('div', { class: 'slide-body' }, s.text || '(no text on this slide)'),
      s.notes && h('div', { class: 'slide-notes' }, h('b', {}, 'Speaker notes: '), s.notes),
    ));
  }
}

async function renderPdf(blob, list, token) {
  const { pdfjs } = await import('../pdf.js');
  const pdf = await pdfjs.getDocument({ data: await blob.arrayBuffer() }).promise;
  if (!isCurrent(token)) return;

  // Draw each page only when it scrolls near the screen (saves memory on phones).
  const observer = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      observer.unobserve(e.target);
      drawPage(pdf, Number(e.target.dataset.page), e.target);
    }
  }, { rootMargin: '600px 0px' });

  const first = await pdf.getPage(1);
  const vp = first.getViewport({ scale: 1 });
  for (let n = 1; n <= pdf.numPages; n++) {
    const box = h('figure', { class: 'slide-page', 'data-page': n, style: `aspect-ratio:${vp.width}/${vp.height}` },
      h('figcaption', {}, `Slide ${n}`));
    list.append(box);
    observer.observe(box);
  }
}

async function drawPage(pdf, n, box) {
  const page = await pdf.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const cssWidth = box.clientWidth || 600;
  const scale = (cssWidth / base.width) * Math.min(window.devicePixelRatio || 1, 2.5);
  const viewport = page.getViewport({ scale });
  const canvas = h('canvas', { width: Math.floor(viewport.width), height: Math.floor(viewport.height) });
  await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
  box.prepend(canvas);
}
