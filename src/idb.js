// IndexedDB key/value store for things too big for localStorage:
// original slide files, slide text, AI notes and quizzes.
const DB = 'flashcards-files';
const STORE = 'kv';
let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Storage failed (the device may be out of space)'));
  });
}

export const get = (key) => run('readonly', (s) => s.get(key));
export const set = (key, value) => run('readwrite', (s) => s.put(value, key));
export const del = (key) => run('readwrite', (s) => s.delete(key));
export const keys = () => run('readonly', (s) => s.getAllKeys());

// Keys per lecture
export const K = {
  file: (id) => `file:${id}`,     // { name, type, blob }
  slides: (id) => `slides:${id}`, // [{ number, text, notes }]
  notes: (id) => `notes:${id}`,   // AI notes object + createdAt
  quiz: (id) => `quiz:${id}`,     // { questions, createdAt, lastScore }
};

export async function deleteLectureData(id) {
  await Promise.all(Object.values(K).map((k) => del(k(id))));
}
