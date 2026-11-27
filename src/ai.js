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
const QUIZ_SYSTEM = `You write multiple-choice exam practice questions for ${STUDENT}.

Write 10 questions spread across the whole lecture. Mix recall (definitions, numbers) with understanding (mechanisms, what happens if a step changes, feedback, comparing related things).
- question: clear and self-contained.
- options: exactly 4 short options. Exactly one is correct. The wrong options should be plausible to a student who half-knows the topic, using real terms from the lecture. No "all of the above" or "none of the above".
- answer_index: position (0–3) of the correct option.
- explanation: 1–2 sentences on why the correct answer is right, and if useful why a tempting wrong option is wrong.

${GROUNDING}`;

const QUIZ_SCHEMA = obj({
  questions: arr(obj({ question: str, options: arr(str), answer_index: { type: 'integer' }, explanation: str })),
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
  const questions = (res.questions || []).filter(
    (q) => clean(q.question) && Array.isArray(q.options) && q.options.length >= 2 && q.answer_index >= 0 && q.answer_index < q.options.length,
  );
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
