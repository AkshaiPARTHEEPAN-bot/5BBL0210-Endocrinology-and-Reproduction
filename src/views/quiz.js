import * as store from '../store.js';
import * as idb from '../idb.js';
import { h, go, render, topbar, loading, loadAI, plural, newToken, isCurrent } from '../ui.js';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Shuffle question order and option order for each attempt.
function newAttempt(questions) {
  return {
    i: 0,
    correct: 0,
    picked: null,
    items: shuffle(questions).map((q) => ({
      ...q,
      options: shuffle(q.options.map((text, idx) => ({ text, correct: idx === q.answer_index }))),
    })),
  };
}

let attempt = null;
export const endQuiz = () => { attempt = null; };

export async function quizView(id) {
  const lecture = store.getLecture(id);
  if (!lecture) return go('#/');
  const token = newToken();
  const back = `#/lecture/${id}`;
  const quiz = await idb.get(idb.K.quiz(id));
  if (!isCurrent(token)) return;

  const status = h('div', {});
  async function create() {
    status.replaceChildren(loading('Claude is writing your quiz… (about a minute)'));
    const ai = await loadAI();
    try {
      const questions = await ai.generateQuiz(await ai.lectureInput(lecture));
      await idb.set(idb.K.quiz(id), { questions, createdAt: Date.now(), lastScore: null });
      attempt = null;
      if (isCurrent(token)) quizView(id);
    } catch (e) {
      console.error(e);
      status.replaceChildren(h('p', { class: 'error-msg' }, ai.friendlyError(e)), h('button', { class: 'btn primary big', onclick: create }, 'Try again'));
    }
  }

  // ---- no quiz yet / start screen ----
  if (!quiz || !attempt || attempt.lectureId !== id) {
    attempt = null;
    status.append(
      quiz && h('button', { class: 'btn primary big', onclick: () => { attempt = { ...newAttempt(quiz.questions), lectureId: id }; quizView(id); } }, 'Start quiz'),
      h('button', { class: quiz ? 'btn big' : 'btn primary big', onclick: () => {
        if (!quiz || confirm('Make a new set of questions? The current ones will be replaced.')) create();
      } }, quiz ? 'New questions' : 'Make a quiz'),
    );
    render(
      topbar('Quiz', { back }),
      h('main', { class: 'empty-state' },
        h('div', { class: 'empty-icon' }, '❓'),
        h('h2', {}, lecture.title),
        h('p', { class: 'muted' }, quiz
          ? `${plural(quiz.questions.length, 'multiple-choice question')}.${quiz.lastScore ? ` Last score: ${quiz.lastScore.correct}/${quiz.lastScore.total}.` : ''}`
          : 'Claude will write 10 multiple-choice questions on this lecture, with an explanation for each answer.'),
        status,
      ),
    );
    return;
  }

  // ---- finished ----
  const total = attempt.items.length;
  if (attempt.i >= total) {
    const pct = attempt.correct / total;
    const grade = pct >= 0.8 ? 'green' : pct >= 0.5 ? 'amber' : 'red';
    const message = pct >= 0.8 ? 'Great work!' : pct >= 0.5 ? 'Getting there — review the notes and try again.' : 'Worth another look at the notes and flashcards.';
    await idb.set(idb.K.quiz(id), { ...quiz, lastScore: { correct: attempt.correct, total, at: Date.now() } });
    const score = attempt.correct;
    attempt = null;
    render(
      topbar('Quiz', { back }),
      h('main', { class: 'finished' },
        h('div', { class: `score-circle ${grade}` }, `${score}/${total}`),
        h('h2', {}, message),
        h('button', { class: 'btn primary big', onclick: () => { attempt = { ...newAttempt(quiz.questions), lectureId: id }; quizView(id); } }, 'Try again'),
        h('a', { class: 'btn big', href: `#/lecture/${id}/notes` }, 'Read the notes'),
        h('a', { class: 'btn big', href: back }, 'Back to lecture'),
      ),
    );
    return;
  }

  // ---- question ----
  const q = attempt.items[attempt.i];
  const answered = attempt.picked !== null;
  const options = q.options.map((o, idx) => {
    let cls = 'option';
    if (answered) {
      if (o.correct) cls += ' correct';
      else if (idx === attempt.picked) cls += ' wrong';
      else cls += ' faded';
    }
    return h('button', { class: cls, disabled: answered, onclick: () => {
      if (attempt.picked !== null) return; // ignore double taps
      attempt.picked = idx;
      if (o.correct) attempt.correct++;
      quizView(id);
    } },
      h('span', { class: 'option-letter' }, answered && o.correct ? '✓' : answered && idx === attempt.picked ? '✗' : LETTERS[idx]),
      h('span', { class: 'option-text' }, o.text),
    );
  });

  const pickedRight = answered && q.options[attempt.picked].correct;
  render(
    topbar('Quiz', { back }),
    h('main', { class: 'quiz' },
      h('div', { class: 'progress' },
        h('div', { class: 'progress-bar' }, h('div', { class: 'progress-fill', style: `width:${(attempt.i / total) * 100}%` })),
        h('span', { class: 'progress-text' }, `${attempt.i + 1} of ${total}`),
      ),
      h('h2', { class: 'quiz-q' }, q.question),
      h('div', { class: 'options' }, options),
      answered && h('div', { class: `explanation ${pickedRight ? 'right' : 'wrong'}` },
        h('strong', {}, pickedRight ? 'Correct! ' : 'Not quite. '),
        q.explanation),
      answered && h('button', { class: 'btn primary big', onclick: () => {
        if (attempt.items[attempt.i] !== q) return; // ignore double taps
        attempt.i++; attempt.picked = null; quizView(id);
      } },
        attempt.i + 1 < total ? 'Next question' : 'See my score'),
    ),
  );
  if (answered) document.querySelector('.explanation')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
