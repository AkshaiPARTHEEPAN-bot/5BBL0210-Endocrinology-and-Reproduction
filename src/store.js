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

// Lecture 2 before Lecture 10: compare titles with numbers as numbers.
export const getLectures = () =>
  [...data.lectures].sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }) || a.createdAt - b.createdAt);
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
  data = { lectures: parsed.lectures, cards: parsed.cards };
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
