// Write flashcards from lecture text with Claude.
import Anthropic from '@anthropic-ai/sdk';

import { DEFAULT_MODEL } from './config.js';

const SYSTEM = `You write revision flashcards for a university Biomedical Science student, from their lecture slides.

Write between 15 and 30 cards for the lecture: fewer for a short or light lecture, more for a dense one. Together the cards should cover what the lecture teaches:
- key concepts and how they relate
- definitions of terms
- mechanisms and pathways, step by step where the order matters (e.g. signalling cascades, feedback loops, cell processes)
- important numbers: values, normal ranges, concentrations, timings, percentages, with units

Each card:
- question: one clear question that makes sense on its own, without seeing the slides. Name the thing being asked about (say "What does LH do to Leydig cells?", not "What does this hormone do?"). Test one idea per card.
- answer: short and accurate, usually one sentence or a short list, at most about 40 words. Give the fact directly; no "The answer is".

Base every card on the lecture content. Do not add numbers or claims the slides do not support. Skip housekeeping slides such as learning outcomes lists, reading lists, references and timetables, and don't write cards about the lecturer or the module itself. Use standard scientific notation and units (e.g. Ca²⁺, mmol/L).`;

const SCHEMA = {
  type: 'object',
  properties: {
    cards: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          answer: { type: 'string' },
        },
        required: ['question', 'answer'],
        additionalProperties: false,
      },
    },
  },
  required: ['cards'],
  additionalProperties: false,
};

/**
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.title       lecture title
 * @param {string} [opts.text]      extracted slide text
 * @param {string} [opts.pdfBase64] whole PDF, used when the PDF has no text layer (scanned slides)
 */
export async function generateCards({ apiKey, model = DEFAULT_MODEL, title, text, pdfBase64 }) {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const content = [];
  if (pdfBase64) {
    content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } });
    content.push({ type: 'text', text: `Lecture: ${title}\n\nWrite the flashcards for the lecture slides in this PDF.` });
  } else {
    content.push({ type: 'text', text: `Lecture: ${title}\n\n<slides>\n${text}\n</slides>\n\nWrite the flashcards for this lecture.` });
  }

  const stream = client.beta.messages.stream({
    model,
    max_tokens: 32000,
    system: SYSTEM,
    messages: [{ role: 'user', content }],
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    // If a safety classifier declines (biomedical content can trip one), the API
    // retries on Anthropic's recommended fallback model instead of failing.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
  });
  const message = await stream.finalMessage();

  if (message.stop_reason === 'refusal') {
    throw new Error('Claude declined to write cards for this lecture. Try removing any unrelated slides and upload again.');
  }
  if (message.stop_reason === 'max_tokens') {
    throw new Error('The response was cut off. Try splitting the lecture into two files.');
  }
  const textOut = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let parsed;
  try {
    parsed = JSON.parse(textOut);
  } catch {
    throw new Error('Could not read the cards Claude returned. Please try again.');
  }
  const cards = (parsed.cards || [])
    .map((c) => ({ question: String(c.question || '').trim(), answer: String(c.answer || '').trim() }))
    .filter((c) => c.question && c.answer);
  if (!cards.length) throw new Error('No cards were produced. Check that the file has readable slide text.');
  return cards;
}

export function friendlyError(err) {
  if (err instanceof Anthropic.AuthenticationError) return 'Your API key was rejected. Check it in Settings.';
  if (err instanceof Anthropic.PermissionDeniedError) return 'This API key can’t use that model. Check your Anthropic account.';
  if (err instanceof Anthropic.RateLimitError) return 'Rate limit reached. Wait a minute and try again.';
  if (err instanceof Anthropic.APIConnectionError) return 'Couldn’t reach the Claude API. Check your internet connection.';
  if (err instanceof Anthropic.APIError) return `Claude API error (${err.status ?? '?'}): ${err.message}`;
  return err?.message || String(err);
}
