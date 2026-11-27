import * as store from '../store.js';
import * as idb from '../idb.js';
import { h, go, render, topbar, loading, loadAI, plural, newToken, isCurrent } from '../ui.js';

const LETTERS = 'ABCDEFGH'.split('');

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Options are { text, why }. Older quizzes stored plain strings plus one
// `explanation` for the question; turn those into the same shape.
function normalise(q) {
  return q.options.map((o, idx) => {
    const opt = typeof o === 'string' ? { text: o, why: '' } : { text: o.text, why: o.why || '' };
    if (!opt.why && idx === q.answer_index && q.explanation) opt.why = q.explanation;
    // The screen already says "Correct", so drop a leading "Correct:" from the explanation.
    opt.why = opt.why.replace(/^correct[:!.—–-]\s*/i, '');
    if (opt.why) opt.why = opt.why[0].toUpperCase() + opt.why.slice(1);
    return { ...opt, correct: idx === q.answer_index };
  });
}

// New attempt: shuffle question order and option order.
function newAttempt(questions, lectureId) {
  return {
    lectureId,
    i: 0,
    correct: 0,
    picked: null,
    mistakes: [],
    items: shuffle(questions).map((q) => ({ question: q.question, options: shuffle(normalise(q)) })),
  };
}

let attempt = null;
export const endQuiz = () => { attempt = null; };

const optionLine = (letter, o) => h('span', {}, h('b', {}, `${letter}. `), o.text);

export async function quizView(id) {
  const lecture = store.getLecture(id);
  if (!lecture) return go('#/');
  const token = newToken();
  const back = `#/lecture/${id}`;
  const quiz = await idb.get(idb.K.quiz(id));
  if (!isCurrent(token)) return;

  const status = h('div', {});
  async function create() {
    const ai = await loadAI();
    status.replaceChildren(loading(`Claude is writing ${ai.QUIZ_LENGTH} exam-style questions… (1–2 minutes)`));
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
  const start = () => { attempt = newAttempt(quiz.questions, id); quizView(id); };

  // ---- start screen ----
  if (!quiz || !attempt || attempt.lectureId !== id) {
    attempt = null;
    status.append(
      quiz && h('button', { class: 'btn primary big', onclick: start }, 'Start quiz'),
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
          ? `${plural(quiz.questions.length, 'question')} · single best answer.${quiz.lastScore ? ` Last score: ${quiz.lastScore.correct}/${quiz.lastScore.total}.` : ''}`
          : 'Claude will write 20 single-best-answer questions (A–E) in the style of the exam, explaining every answer.'),
        quiz && h('p', { class: 'muted small-text' }, 'Choose the single best answer. If you get one wrong you’ll see why, and why the right answer is right.'),
        status,
      ),
    );
    return;
  }

  // ---- finished ----
  const total = attempt.items.length;
  if (attempt.i >= total) {
    const { correct, mistakes } = attempt;
    const pct = correct / total;
    const grade = pct >= 0.8 ? 'green' : pct >= 0.5 ? 'amber' : 'red';
    const message = pct >= 0.8 ? 'Great work!' : pct >= 0.5 ? 'Getting there — go over your mistakes below.' : 'Worth another look — go over your mistakes below.';
    await idb.set(idb.K.quiz(id), { ...quiz, lastScore: { correct, total, at: Date.now() } });
    attempt = null;
    render(
      topbar('Quiz', { back }),
      h('main', { class: 'finished' },
        h('div', { class: `score-circle ${grade}` }, `${correct}/${total}`),
        h('h2', {}, message),
        h('button', { class: 'btn primary big', onclick: start }, 'Try again'),
        mistakes.length ? h('section', { class: 'review' },
          h('h3', {}, `Review your mistakes (${mistakes.length})`),
          mistakes.map((m) => h('div', { class: 'review-item' },
            h('p', { class: 'review-q' }, m.question),
            h('div', { class: 'why wrong' }, h('strong', {}, 'Your answer: '), optionLine(m.pickedLetter, m.picked), m.picked.why && h('p', {}, m.picked.why)),
            h('div', { class: 'why right' }, h('strong', {}, 'Correct answer: '), optionLine(m.correctLetter, m.right), m.right.why && h('p', {}, m.right.why)),
          )),
        ) : null,
        h('a', { class: 'btn big', href: `#/lecture/${id}/notes` }, 'Read the notes'),
        h('a', { class: 'btn big', href: back }, 'Back to lecture'),
      ),
    );
    return;
  }

  // ---- question ----
  const q = attempt.items[attempt.i];
  const answered = attempt.picked !== null;
  const correctIdx = q.options.findIndex((o) => o.correct);
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
      else attempt.mistakes.push({ question: q.question, picked: o, pickedLetter: LETTERS[idx], right: q.options[correctIdx], correctLetter: LETTERS[correctIdx] });
      quizView(id);
    } },
      h('span', { class: 'option-letter' }, answered && o.correct ? '✓' : answered && idx === attempt.picked ? '✗' : LETTERS[idx]),
      h('span', { class: 'option-text' }, o.text),
    );
  });

  let feedback = null;
  if (answered) {
    const picked = q.options[attempt.picked];
    const right = q.options[correctIdx];
    const others = q.options.map((o, idx) => ({ o, idx })).filter(({ o, idx }) => idx !== correctIdx && idx !== attempt.picked && o.why);
    feedback = h('div', { class: 'feedback' },
      picked.correct
        ? h('div', { class: 'why right' }, h('strong', {}, `✓ Correct — ${LETTERS[correctIdx]}. `), right.why || '')
        : [
          h('div', { class: 'why wrong' }, h('strong', {}, `✗ Why ${LETTERS[attempt.picked]} is wrong: `), picked.why || 'This is not the best answer.'),
          h('div', { class: 'why right' }, h('strong', {}, `✓ The correct answer is ${LETTERS[correctIdx]}: `), right.text, right.why && h('p', {}, right.why)),
        ],
      others.length ? h('details', { class: 'others' },
        h('summary', {}, 'Why the other options are wrong'),
        h('ul', {}, others.map(({ o, idx }) => h('li', {}, h('b', {}, `${LETTERS[idx]}. `), o.why))),
      ) : null,
    );
  }

  render(
    topbar('Quiz', { back }),
    h('main', { class: 'quiz' },
      h('div', { class: 'progress' },
        h('div', { class: 'progress-bar' }, h('div', { class: 'progress-fill', style: `width:${(attempt.i / total) * 100}%` })),
        h('span', { class: 'progress-text' }, `${attempt.i + 1} of ${total} · ${attempt.correct} right`),
      ),
      h('h2', { class: 'quiz-q' }, h('span', { class: 'q-num' }, `${attempt.i + 1}. `), q.question),
      h('div', { class: 'options' }, options),
      feedback,
      answered && h('button', { class: 'btn primary big', onclick: () => {
        if (attempt.items[attempt.i] !== q) return; // ignore double taps
        attempt.i++; attempt.picked = null; quizView(id);
      } }, attempt.i + 1 < total ? 'Next question' : 'See my score'),
    ),
  );
  if (answered) document.querySelector('.feedback')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
