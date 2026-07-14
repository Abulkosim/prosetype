import type { PassageWord } from './passage.ts';
import type { CharState, WordRunState } from './state.ts';

/**
 * Immutable per-word view. Word objects are cached and only replaced when the
 * word actually changes, so `React.memo` components can compare by reference.
 */
export interface WordSnapshot {
  readonly wordIndex: number;
  /** The target word text (no spaces). */
  readonly target: string;
  /** Passage index of the word's first character. */
  readonly start: number;
  /** Actually typed characters in the target slots (length <= target.length). */
  readonly typed: string;
  /** State per target character (length === target.length). */
  readonly states: readonly CharState[];
  /** Extra characters typed beyond the word (state `extra`, max 8). */
  readonly extras: string;
  readonly committed: boolean;
  /** True iff the word is committed and fully correct. */
  readonly committedCorrect: boolean;
}

/**
 * Build a fresh {@link WordSnapshot} from a word's current run state. Shared
 * by the live {@link TypingEngine} and {@link ReplayEngine} so the two never
 * drift on what a "snapshot" means; callers cache the result themselves and
 * only call this again once the word's state has actually changed.
 */
export function wordSnapshotOf(word: PassageWord, ws: WordRunState, wi: number): WordSnapshot {
  return {
    wordIndex: wi,
    target: word.text,
    start: word.start,
    typed: ws.typed.join(''),
    states: [...ws.slotStates],
    extras: ws.extras.join(''),
    committed: ws.committed,
    committedCorrect: ws.committed && ws.committedCorrect,
  };
}
