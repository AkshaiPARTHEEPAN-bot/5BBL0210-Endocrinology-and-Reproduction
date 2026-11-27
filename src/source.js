// Reading an uploaded slide file and getting a lecture's slides back for Claude.
import * as idb from './idb.js';
import { extractSlides, slidesToText, looksScanned } from './extract.js';

export async function readSlideFile(file) {
  const { kind, slides } = await extractSlides(file);
  if (!slides.length) throw new Error('No slides found in this file.');
  const scanned = looksScanned(slides);
  if (scanned && kind !== 'pdf') throw new Error('Hardly any text found on the slides (they may be pictures). Try exporting the slides as PDF.');
  if (scanned && file.size > 30 * 1024 * 1024) throw new Error('This PDF has no text layer and is too big (over 30 MB) to send to Claude.');
  return { kind, slides, scanned };
}

// Save the file + slide text for a lecture (for the Slides, Notes and Quiz screens).
export async function saveSlideFile(lectureId, file, slides) {
  await idb.set(idb.K.file(lectureId), { name: file.name, type: file.type, blob: file });
  await idb.set(idb.K.slides(lectureId), slides);
}

const toBase64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1]);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

// What Claude gets for a lecture: slide text, or the PDF itself if the slides are pictures.
export async function lectureInput(lecture, { file, slides, scanned } = {}) {
  slides ??= await idb.get(idb.K.slides(lecture.id));
  if (!slides) throw new Error('This lecture’s slides aren’t saved on this device. Re-upload the slide file on the lecture page.');
  scanned ??= lecture.scanned;
  let pdfBase64 = null;
  if (scanned) {
    file ??= (await idb.get(idb.K.file(lecture.id)))?.blob;
    if (!file) throw new Error('The PDF for this lecture isn’t saved on this device. Re-upload it on the lecture page.');
    pdfBase64 = await toBase64(file);
  }
  return { title: lecture.title, text: slidesToText(slides), pdfBase64 };
}
