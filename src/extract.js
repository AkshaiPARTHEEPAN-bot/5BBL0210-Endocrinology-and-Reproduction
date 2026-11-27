// Read the text from every slide of a .pptx or every page of a .pdf.
import JSZip from 'jszip';
import { pdfjs } from './pdf.js';

export async function extractSlides(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pptx')) return { kind: 'pptx', slides: await extractPptx(file) };
  if (name.endsWith('.pdf')) return { kind: 'pdf', slides: await extractPdf(file) };
  if (name.endsWith('.ppt')) {
    throw new Error('Old .ppt files can’t be read. Open it in PowerPoint and “Save As” .pptx (or export as PDF), then upload that.');
  }
  throw new Error('Please upload a .pptx or .pdf file.');
}

// ---------- PowerPoint ----------

const parseXml = (text) => new DOMParser().parseFromString(text, 'application/xml');
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';

function xmlText(doc) {
  // One line per paragraph (<a:p>), joining its text runs (<a:t>).
  const lines = [];
  for (const p of doc.getElementsByTagNameNS(A_NS, 'p')) {
    const runs = [...p.getElementsByTagNameNS(A_NS, 't')].map((t) => t.textContent).join('');
    if (runs.trim()) lines.push(runs.trim());
  }
  return lines.join('\n');
}

function resolvePath(base, target) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

async function extractPptx(file) {
  const zip = await JSZip.loadAsync(file);

  // Slide order comes from presentation.xml (not file names).
  let slidePaths = [];
  const presXml = zip.file('ppt/presentation.xml');
  const presRels = zip.file('ppt/_rels/presentation.xml.rels');
  if (presXml && presRels) {
    const rels = parseXml(await presRels.async('text'));
    const relMap = {};
    for (const r of rels.getElementsByTagName('Relationship')) relMap[r.getAttribute('Id')] = r.getAttribute('Target');
    const pres = parseXml(await presXml.async('text'));
    for (const s of pres.getElementsByTagName('*')) {
      if (s.localName === 'sldId') {
        const rid = s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || s.getAttribute('r:id');
        if (relMap[rid]) slidePaths.push(resolvePath('ppt/presentation.xml', relMap[rid]));
      }
    }
  }
  if (!slidePaths.length) {
    slidePaths = Object.keys(zip.files)
      .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
      .sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));
  }

  const slides = [];
  for (const [i, path] of slidePaths.entries()) {
    const f = zip.file(path);
    if (!f) continue;
    const text = xmlText(parseXml(await f.async('text')));

    // Speaker notes often hold the detail the lecturer says out loud.
    let notes = '';
    const relFile = zip.file(path.replace(/slides\/(slide\d+\.xml)$/, 'slides/_rels/$1.rels'));
    if (relFile) {
      const rels = parseXml(await relFile.async('text'));
      for (const r of rels.getElementsByTagName('Relationship')) {
        if ((r.getAttribute('Type') || '').endsWith('/notesSlide')) {
          const nf = zip.file(resolvePath(path, r.getAttribute('Target')));
          if (nf) {
            notes = xmlText(parseXml(await nf.async('text')))
              .split('\n').filter((l) => !/^\d+$/.test(l)).join('\n'); // drop slide-number placeholder
          }
        }
      }
    }
    slides.push({ number: i + 1, text, notes });
  }
  return slides;
}

// ---------- PDF ----------

async function extractPdf(file) {
  const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const pdf = await task.promise;
  const slides = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    let text = '';
    for (const item of content.items) {
      if (!('str' in item)) continue;
      text += item.str;
      text += item.hasEOL ? '\n' : (item.str && !item.str.endsWith(' ') ? ' ' : '');
    }
    slides.push({ number: n, text: text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(), notes: '' });
  }
  await task.destroy();
  return slides;
}

export function slidesToText(slides) {
  return slides
    .map((s) => {
      let out = `--- Slide ${s.number} ---\n${s.text || '(no text)'}`;
      if (s.notes) out += `\n[Speaker notes]\n${s.notes}`;
      return out;
    })
    .join('\n\n');
}

export const wordCount = (slides) =>
  slides.reduce((n, s) => n + `${s.text} ${s.notes}`.split(/\s+/).filter(Boolean).length, 0);

// Slides with almost no text are probably images (scanned/exported as pictures).
export const looksScanned = (slides) => wordCount(slides) < 5 * Math.max(1, slides.length);
