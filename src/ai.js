// Everything Claude writes: flashcards, revision notes and quizzes.
import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_MODEL } from './config.js';
import { getSettings } from './store.js';

const STUDENT = 'a university Biomedical Science student revising from their lecture slides';
const GROUNDING = `Base everything on the lecture content. Do not add numbers or claims the slides do not support. Ignore housekeeping slides such as learning outcomes lists, reading lists, references and timetables, and don't write about the lecturer or the module itself. Use standard scientific notation and units (e.g. Ca²⁺, mmol/L).`;

const obj = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const str = { type: 'string' };
const arr = (items) => ({ type: 'array', items });

// ---------- flashcards ----------
const CARDS_SYSTEM = `You write revision flashcards for ${STUDENT}.

Write between 15 and 30 cards for the lecture: fewer for a short or light lecture, more for a dense one. Together the cards should cover what the lecture teaches:
- key concepts and how they relate
- definitions of terms
- mechanisms and pathways, step by step where the order matters (e.g. signalling cascades, feedback loops, cell processes)
- important numbers: values, normal ranges, concentrations, timings, percentages, with units

Each card:
- question: one clear question that makes sense on its own, without seeing the slides. Name the thing being asked about (say "What does LH do to Leydig cells?", not "What does this hormone do?"). Test one idea per card.
- answer: short and accurate, usually one sentence or a short list, at most about 40 words. Give the fact directly; no "The answer is".

${GROUNDING}`;

const CARDS_SCHEMA = obj({ cards: arr(obj({ question: str, answer: str })) });

// ---------- notes ----------
const NOTES_SYSTEM = `You write revision notes for ${STUDENT}. The notes should let them revise the whole lecture without the slides.

- summary: 2–4 sentences on what the lecture is about and its main take-home messages.
- sections: the lecture's topics in the order they are taught. Each has a short heading and bullet points. Each point is one short, complete idea (at most about 30 words). Lay out mechanisms and pathways as ordered steps, one step per point, using "→" where it helps. Include every important fact from the slides; leave out filler.
- key_terms: the important terms with a one-sentence definition each.
- key_numbers: important values with units (normal ranges, concentrations, timings, percentages) and what each refers to. Use an empty list if the lecture has none.

${GROUNDING}`;

const NOTES_SCHEMA = obj({
  summary: str,
  sections: arr(obj({ heading: str, points: arr(str) })),
  key_terms: arr(obj({ term: str, definition: str })),
  key_numbers: arr(obj({ value: str, meaning: str })),
});

// ---------- quiz ----------
export const QUIZ_LENGTH = 20;

const QUIZ_SYSTEM = `You write single-best-answer multiple-choice exam questions for ${STUDENT}. They must match the style of the module's exam.

Write ${QUIZ_LENGTH} questions spread across the whole lecture. Each question has exactly 5 options (A–E) and exactly one best answer.

Question styles to mix (as in the real exam):
- An incomplete statement that the options complete, e.g. "Thyroid hormones:" or "In normal subjects oral glucose delivery induces:"
- "Which of the following statements about X is TRUE?"
- "Which of the following statements about X is FALSE?" (use for about 1 in 5 questions; the correct answer is then the false statement)
- A short direct question with short options (a number, a cell type, a drug class).

Examples of the exam style (the topic is only an example; write about the lecture):
  Glucagon:
  A. Is secreted by pancreatic β-cells.
  B. Stimulates hepatic glycogenolysis.   <- correct
  C. Lowers blood glucose.
  D. Is a steroid hormone.
  E. Is released mainly after a carbohydrate meal.

  Which of the following statements about cortisol is FALSE?
  A. Cortisol is synthesised from cholesterol.
  B. Cortisol is secreted by the adrenal cortex.
  C. Cortisol has anti-inflammatory actions.
  D. Cortisol lowers blood glucose.   <- correct (it is the false one)
  E. Cortisol secretion is stimulated by ACTH.

Options:
- Full statements (or short terms) of similar length and grammar, so the answer can't be spotted by its form.
- Wrong options must be plausible to a student who half-knows the lecture: swapped numbers, the wrong organelle/cell/hormone, reversed effects, a fact that belongs to a different disease or drug. Use real terms from the lecture.
- No "all of the above" / "none of the above".
- Mix recall (numbers, definitions) with understanding (mechanisms, sequences, comparing similar things).

For EVERY option write "why" (1–2 sentences) — this is shown to the student after they answer:
- For the correct option: why it is right, with the key fact.
- For each wrong option: exactly what is wrong with it and what the lecture actually says (e.g. "β-cells make up ~60–80%, not 20–40%").
- In a FALSE/NOT/INCORRECT question, say "This is false, so it is the answer: …" for the answer and "True: … so not the answer" for the others.

answer_index is the 0-based position of the correct option.

${GROUNDING}`;

const QUIZ_SCHEMA = obj({
  questions: arr(obj({
    question: str,
    options: arr(obj({ text: str, why: str })),
    answer_index: { type: 'integer' },
  })),
});

// ---------- shared request ----------
function lectureContent({ title, text, pdfBase64 }, ask) {
  if (pdfBase64) {
    return [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
      { type: 'text', text: `Lecture: ${title}\n\nThe lecture slides are in this PDF. ${ask}` },
    ];
  }
  return [{ type: 'text', text: `Lecture: ${title}\n\n<slides>\n${text}\n</slides>\n\n${ask}` }];
}

async function ask({ system, schema, content }) {
  const { apiKey, model } = getSettings();
  if (!apiKey) throw new Error('Add your Claude API key in Settings first.');
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const stream = client.beta.messages.stream({
    model: model || DEFAULT_MODEL,
    max_tokens: 32000,
    system,
    messages: [{ role: 'user', content }],
    output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
    // If a safety classifier declines (biomedical content can trip one), the API
    // retries on Anthropic's recommended fallback model instead of failing.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === 'refusal') {
    throw new Error('Claude declined this lecture. Try removing unrelated slides and upload again.');
  }
  if (message.stop_reason === 'max_tokens') {
    throw new Error('The response was cut off. Try splitting the lecture into two files.');
  }
  const out = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  try {
    return JSON.parse(out);
  } catch {
    throw new Error('Could not read Claude’s reply. Please try again.');
  }
}

const clean = (s) => String(s ?? '').trim();

export async function generateCards(lecture) {
  const res = await ask({ system: CARDS_SYSTEM, schema: CARDS_SCHEMA, content: lectureContent(lecture, 'Write the flashcards for this lecture.') });
  const cards = (res.cards || []).map((c) => ({ question: clean(c.question), answer: clean(c.answer) })).filter((c) => c.question && c.answer);
  if (!cards.length) throw new Error('No cards were produced. Check that the file has readable slide text.');
  return cards;
}

export async function generateNotes(lecture) {
  const res = await ask({ system: NOTES_SYSTEM, schema: NOTES_SCHEMA, content: lectureContent(lecture, 'Write the revision notes for this lecture.') });
  if (!res.sections?.length) throw new Error('No notes were produced. Please try again.');
  return res;
}

export async function generateQuiz(lecture) {
  const res = await ask({ system: QUIZ_SYSTEM, schema: QUIZ_SCHEMA, content: lectureContent(lecture, 'Write the quiz for this lecture.') });
  const questions = (res.questions || [])
    .map((q) => ({
      question: clean(q.question),
      options: (q.options || []).map((o) => ({ text: clean(o.text), why: clean(o.why) })).filter((o) => o.text),
      answer_index: q.answer_index,
    }))
    .filter((q) => q.question && q.options.length >= 3 && q.answer_index >= 0 && q.answer_index < q.options.length);
  if (!questions.length) throw new Error('No questions were produced. Please try again.');
  return questions;
}

export function friendlyError(err) {
  if (err instanceof Anthropic.AuthenticationError) return 'Your API key was rejected. Check it in Settings.';
  if (err instanceof Anthropic.PermissionDeniedError) return 'This API key can’t use that model. Check your Anthropic account.';
  if (err instanceof Anthropic.RateLimitError) return 'Rate limit reached. Wait a minute and try again.';
  if (err instanceof Anthropic.APIConnectionError) return 'Couldn’t reach the Claude API. Check your internet connection.';
  if (err instanceof Anthropic.APIError) return `Claude API error (${err.status ?? '?'}): ${err.message}`;
  return err?.message || String(err);
}
