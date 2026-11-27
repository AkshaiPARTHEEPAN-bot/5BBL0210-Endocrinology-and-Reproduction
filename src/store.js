// All data lives in the browser's localStorage, so it survives reloads.
import { newCardState } from './srs.js';
import * as idb from './idb.js';

const KEY = 'flashcards.v1';
const KEY_SETTINGS = 'flashcards.settings.v1';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Could not read saved data', e);
  }
  return { lectures: [], cards: [] };
}

let data = load();

function save() {
  localStorage.setItem(KEY, JSON.stringify(data));
}

// Sort by lecture number; lectures without a number go last, by name
// (numbers in names compare as numbers, so "Lecture 2" comes before "Lecture 10").
export const getLectures = () =>
  [...data.lectures].sort((a, b) =>
    (a.number ?? Infinity) - (b.number ?? Infinity) ||
    a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }) ||
    a.createdAt - b.createdAt);

// Guess a lecture number from a file name like "Lecture 3 – Thyroid.pdf" or "L03_thyroid.pptx".
export function guessNumber(name) {
  const m = name.match(/\b(?:lecture|lec|l)[\s_-]*0*(\d{1,2})(?!\d)/i) || name.match(/^0*(\d{1,2})[\s_.-]/);
  return m ? Number(m[1]) : null;
}

// Next free lecture number (one after the highest used).
export const nextNumber = () => Math.max(0, ...data.lectures.map((l) => l.number ?? 0)) + 1;

const NUMBER_WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty'];
export const numberWord = (n) => NUMBER_WORDS[n] ?? String(n);

// "5BBL0210_-_Control_of_testicular_function_-_updated_75b5…f8.pdf" -> "Control of testicular function"
export function cleanTitle(fileName) {
  let t = fileName.replace(/\.(pptx|pdf)$/i, '')
    .replace(/[_\s-]+[0-9a-f]{16,}$/i, '')       // long hash suffix
    .replace(/^[0-9a-f]{6,}-/i, '')                // short hash prefix
    .replace(/^\s*[0-9]?[A-Z]{3,4}\d{3,4}[_\s-]*/, '') // module code e.g. 5BBL0210
    .replace(/_/g, ' ')
    .replace(/\s*-\s*updated\b/i, '')
    .replace(/\b(19|20)\d\d\b/g, '')               // year
    .replace(/\b(?:lecture|lec)\s*\d+\b/i, '')      // "Lecture 3" (kept as the number instead)
    .replace(/^[\s\-–:]+|[\s\-–:]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!t) t = fileName.replace(/\.(pptx|pdf)$/i, '');
  return t[0].toUpperCase() + t.slice(1);
}

// Add built-in lectures (with their notes and quiz) the first time the app runs.
// Remembered in `seeded`, so a built-in lecture you delete doesn't come back.
export async function seedBuiltins(list) {
  data.seeded ??= [];
  const now = Date.now();
  for (const b of list) {
    if (data.seeded.includes(b.id)) continue;
    if (!getLecture(b.id)) {
      data.lectures.push({ id: b.id, title: b.title, number: b.number, createdAt: now, builtin: true, slideCount: b.slideCount });
      for (const c of b.cards) addCardRaw(b.id, c.question, c.answer, now);
      if (b.notes) await idb.set(idb.K.notes(b.id), { ...b.notes, createdAt: now });
      if (b.quiz) await idb.set(idb.K.quiz(b.id), { questions: b.quiz, createdAt: now, lastScore: null, builtinVersion: b.quizVersion ?? 1 });
    }
    data.seeded.push(b.id);
    save();
  }
  // Built-in quizzes that have been improved since they were added: update them,
  // unless the quiz was replaced with "New questions" (then it's the student's own).
  for (const b of list) {
    if (!b.quiz || !getLecture(b.id)) continue;
    const q = await idb.get(idb.K.quiz(b.id));
    const stored = q?.builtinVersion ?? (q && typeof q.questions?.[0]?.options?.[0] === 'string' ? 1 : null);
    if (stored != null && stored < (b.quizVersion ?? 1)) {
      await idb.set(idb.K.quiz(b.id), { questions: b.quiz, createdAt: now, lastScore: null, builtinVersion: b.quizVersion });
    }
  }
}
export const getLecture = (id) => data.lectures.find((l) => l.id === id);
export const getCards = (lectureId) =>
  lectureId ? data.cards.filter((c) => c.lectureId === lectureId) : [...data.cards];
export const getCard = (id) => data.cards.find((c) => c.id === id);

export function addLecture(title, meta, cards) {
  const now = Date.now();
  const lecture = { id: uid(), title, createdAt: now, ...meta };
  data.lectures.push(lecture);
  for (const c of cards) addCardRaw(lecture.id, c.question, c.answer, now);
  save();
  return lecture;
}

function addCardRaw(lectureId, question, answer, now = Date.now()) {
  const card = { id: uid(), lectureId, question, answer, createdAt: now, ...newCardState(now) };
  data.cards.push(card);
  return card;
}

export function addCard(lectureId, question, answer) {
  const card = addCardRaw(lectureId, question, answer);
  save();
  return card;
}

export function updateCard(id, patch) {
  const i = data.cards.findIndex((c) => c.id === id);
  if (i === -1) return;
  data.cards[i] = { ...data.cards[i], ...patch };
  save();
  return data.cards[i];
}

export function deleteCard(id) {
  data.cards = data.cards.filter((c) => c.id !== id);
  save();
}

export function updateLecture(id, patch) {
  const l = getLecture(id);
  if (l) { Object.assign(l, patch); save(); }
  return l;
}

export async function deleteLecture(id) {
  data.lectures = data.lectures.filter((l) => l.id !== id);
  data.cards = data.cards.filter((c) => c.lectureId !== id);
  save();
  await idb.deleteLectureData(id);
}

// Backup = lectures, cards, progress, slide text, notes and quizzes.
// The original slide files are left out to keep the file small.
export async function exportData() {
  const extra = {};
  for (const l of data.lectures) {
    extra[l.id] = {
      slides: await idb.get(idb.K.slides(l.id)),
      notes: await idb.get(idb.K.notes(l.id)),
      quiz: await idb.get(idb.K.quiz(l.id)),
    };
  }
  return JSON.stringify({ app: 'flashcards', version: 2, exportedAt: new Date().toISOString(), ...data, extra }, null, 2);
}

export async function importData(json) {
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed.lectures) || !Array.isArray(parsed.cards)) throw new Error('Not a flashcards backup file');
  for (const l of data.lectures) await idb.deleteLectureData(l.id);
  data = { lectures: parsed.lectures, cards: parsed.cards, seeded: parsed.seeded || parsed.lectures.filter((l) => l.builtin).map((l) => l.id) };
  save();
  for (const [id, x] of Object.entries(parsed.extra || {})) {
    if (x.slides) await idb.set(idb.K.slides(id), x.slides);
    if (x.notes) await idb.set(idb.K.notes(id), x.notes);
    if (x.quiz) await idb.set(idb.K.quiz(id), x.quiz);
  }
}

export function getSettings() {
  try { return JSON.parse(localStorage.getItem(KEY_SETTINGS)) || {}; } catch { return {}; }
}

export function saveSettings(patch) {
  localStorage.setItem(KEY_SETTINGS, JSON.stringify({ ...getSettings(), ...patch }));
}
