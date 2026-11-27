import './style.css';
import { homeView } from './views/home.js';
import { uploadView } from './views/upload.js';
import { lectureHubView, cardsView } from './views/lecture.js';
import { studyView, endSession } from './views/study.js';
import { slidesView } from './views/slides.js';
import { notesView } from './views/notes.js';
import { quizView, endQuiz } from './views/quiz.js';
import { settingsView } from './views/settings.js';
import { newToken } from './ui.js';
import { seedBuiltins } from './store.js';

// Bump when built-in lecture content changes, so devices pick up the new content.
const CONTENT_VERSION = '2026-11-27.1';
const CONTENT_KEY = 'flashcards.contentVersion';

// The built-in lectures are only downloaded when there is something new to add.
async function addBuiltinLectures() {
  if (localStorage.getItem(CONTENT_KEY) === CONTENT_VERSION) return;
  const { BUILTIN_LECTURES } = await import('./content/index.js');
  await seedBuiltins(BUILTIN_LECTURES);
  localStorage.setItem(CONTENT_KEY, CONTENT_VERSION);
}

// Screens:
//   #/                          home: all lectures + due count
//   #/upload                    upload slide files
//   #/lecture/<id>              lecture page: Slides / Notes / Flashcards / Quiz
//   #/lecture/<id>/slides|notes|cards|quiz
//   #/study/<id|all>            flashcard study session
//   #/settings
function route() {
  const [view, id, sub] = (location.hash || '#/').replace(/^#\/?/, '').split('/');
  if (view !== 'study') endSession();
  if (!(view === 'lecture' && sub === 'quiz')) endQuiz();
  newToken(); // cancels any slow screen still loading
  if (view === 'upload') uploadView();
  else if (view === 'study' && id) studyView(id);
  else if (view === 'lecture' && id) {
    if (sub === 'slides') slidesView(id);
    else if (sub === 'notes') notesView(id);
    else if (sub === 'cards') cardsView(id);
    else if (sub === 'quiz') quizView(id);
    else lectureHubView(id);
  } else if (view === 'settings') settingsView();
  else homeView();
}

window.addEventListener('hashchange', route);
addBuiltinLectures().catch((e) => console.error('Could not add built-in lectures', e)).finally(route);
