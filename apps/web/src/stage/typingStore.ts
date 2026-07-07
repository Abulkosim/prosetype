import {
  createEngine,
  type EngineSnapshot,
  type RunStats,
  type TypingEngine,
} from '@prosetype/engine';
import type { Passage } from '@prosetype/schema';
import { create } from 'zustand';

import { fetchNextPassage } from '../lib/api';
import { pushRecent } from '../lib/recent';
import type { CompletedRun } from '../result/ResultView';

/** §9.3 completion: hold the finished passage briefly, then cut to the result. */
export const COMPLETION_HOLD_MS = 300;

export type StagePhase = 'loading' | 'error' | 'typing' | 'complete';

/**
 * Thin zustand store wrapping the engine (plan §3). The engine is the source
 * of truth: input handlers append to it synchronously (with the
 * `performance.now()` captured in the DOM handler) and React renders from the
 * derived `snapshot`. Nothing here does stat math of its own.
 */
interface TypingState {
  phase: StagePhase;
  passage: Passage | null;
  /** The live engine — mutated in place; never render from it directly. */
  engine: TypingEngine | null;
  /** Derived render state; replaced after every applied input. */
  snapshot: EngineSnapshot | null;
  completedRun: CompletedRun | null;
  errorMessage: string | null;
  /** True when the current run followed an esc-restart of the same passage (§7.1). */
  restarted: boolean;
  capsLock: boolean;
  /** Up to the last 20 passage ids, excluded from the next fetch (plan §8). */
  recentIds: readonly number[];
  /** Tab: abandon the current run and fetch a new random passage. */
  loadNext: () => Promise<void>;
  /** Esc: restart the same passage from scratch. */
  restart: () => void;
  typeChar: (char: string, timestampMs: number) => void;
  commitSpace: (timestampMs: number) => void;
  backspace: (timestampMs: number, wholeWord: boolean) => void;
  setCapsLock: (on: boolean) => void;
  /** Live §7.3 stats for the HUD (display only — never used for stat math). */
  getLiveStats: () => RunStats | null;
}

let inFlight = false;
let holdTimer: ReturnType<typeof setTimeout> | null = null;

function clearHold(): void {
  if (holdTimer !== null) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
}

export const useTypingStore = create<TypingState>()((set, get) => ({
  phase: 'loading',
  passage: null,
  engine: null,
  snapshot: null,
  completedRun: null,
  errorMessage: null,
  restarted: false,
  capsLock: false,
  recentIds: [],

  loadNext: async () => {
    if (inFlight) return; // one fetch at a time (also guards StrictMode's double effect)
    inFlight = true;
    clearHold();
    set({
      phase: 'loading',
      engine: null,
      snapshot: null,
      completedRun: null,
      errorMessage: null,
      restarted: false,
    });
    try {
      const passage = await fetchNextPassage(get().recentIds);
      const engine = createEngine(passage.text);
      set({
        phase: 'typing',
        passage,
        engine,
        snapshot: engine.getSnapshot(),
        recentIds: pushRecent(get().recentIds, passage.id),
      });
    } catch {
      set({ phase: 'error', passage: null, errorMessage: 'could not load a passage' });
    } finally {
      inFlight = false;
    }
  },

  restart: () => {
    const { passage, snapshot } = get();
    if (passage === null) return;
    clearHold();
    const engine = createEngine(passage.text);
    set({
      phase: 'typing',
      engine,
      snapshot: engine.getSnapshot(),
      completedRun: null,
      // Mark restarted only when a run of this passage had actually started.
      restarted: get().restarted || (snapshot !== null && snapshot.status !== 'idle'),
    });
  },

  typeChar: (char, timestampMs) => {
    const { engine, phase } = get();
    if (engine === null || phase !== 'typing') return;
    // Engine chars are single UTF-16 code units; non-BMP input (emoji etc.)
    // can never be correct against an ASCII passage and is skipped.
    if (char.length !== 1 || char === ' ') return;
    engine.addChar(char, timestampMs);
    const snapshot = engine.getSnapshot();
    set({ snapshot });
    if (snapshot.status === 'complete' && holdTimer === null) {
      const completedRun: CompletedRun = {
        stats: engine.getStats(),
        log: engine.getLog(),
        restarted: get().restarted,
      };
      holdTimer = setTimeout(() => {
        holdTimer = null;
        set({ phase: 'complete', completedRun });
      }, COMPLETION_HOLD_MS);
    }
  },

  commitSpace: (timestampMs) => {
    const { engine, phase } = get();
    if (engine === null || phase !== 'typing') return;
    engine.commitSpace(timestampMs);
    set({ snapshot: engine.getSnapshot() });
  },

  backspace: (timestampMs, wholeWord) => {
    const { engine, phase } = get();
    if (engine === null || phase !== 'typing') return;
    engine.backspace(timestampMs, { wholeWord });
    set({ snapshot: engine.getSnapshot() });
  },

  setCapsLock: (on) => {
    if (get().capsLock !== on) set({ capsLock: on });
  },

  getLiveStats: () => get().engine?.getStats() ?? null,
}));

/** Reset module-level timers/flags and store state. Test helper only. */
export function resetTypingStore(): void {
  clearHold();
  inFlight = false;
  useTypingStore.setState({
    phase: 'loading',
    passage: null,
    engine: null,
    snapshot: null,
    completedRun: null,
    errorMessage: null,
    restarted: false,
    capsLock: false,
    recentIds: [],
  });
}
