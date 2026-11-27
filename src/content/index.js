// Lectures that come built in, with flashcards, notes and quiz already written.
import { expand } from './helpers.js';

const modules = import.meta.glob('./lecture-*.js', { eager: true });

export const BUILTIN_LECTURES = Object.values(modules)
  .map((m) => expand(m.default))
  .sort((a, b) => a.number - b.number);
