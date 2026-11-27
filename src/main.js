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
route();
