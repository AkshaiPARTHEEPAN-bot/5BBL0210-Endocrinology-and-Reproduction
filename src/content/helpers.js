// Helpers for writing built-in lecture content compactly.

// A single-best-answer question. The FIRST option is the correct one
// (options are shuffled when the quiz is shown). Each option is [text, why].
export const mcq = (question, options) => ({
  question,
  options: options.map(([text, why]) => ({ text, why })),
  answer_index: 0,
});

// Turn compact content ([q, a] cards, [term, definition] pairs) into the app's shapes.
export function expand(lecture) {
  const pairs = (list, a, b) => (list || []).map((x) => (Array.isArray(x) ? { [a]: x[0], [b]: x[1] } : x));
  return {
    ...lecture,
    cards: pairs(lecture.cards, 'question', 'answer'),
    notes: lecture.notes && {
      ...lecture.notes,
      key_terms: pairs(lecture.notes.key_terms, 'term', 'definition'),
      key_numbers: pairs(lecture.notes.key_numbers, 'value', 'meaning'),
    },
  };
}
