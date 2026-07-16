import { describe, expect, it } from 'vitest';

import { computePerSecondRawWpm, computeStats, createEngine, type TypingEngine } from '../src/index.ts';
import { typeEvenly } from './helpers.ts';

/**
 * Timed mode (§2.3): a run is cut off at a fixed window rather than at the end
 * of the text. The engine's `finish()` freezes it mid-word, and stats are
 * measured over the fixed window via `durationOverrideMs` - and crucially the
 * server reproduces the identical figure from the log + window alone (it never
 * calls finish(); it just replays the log with the same window).
 */
describe('timed mode duration override', () => {
  const WINDOW_MS = 30_000;

  /** Type a prefix of `text` (leaving the run mid-buffer), one key per `stepMs`. */
  function typePartial(text: string, chars: number, stepMs = 120): TypingEngine {
    const engine = createEngine(text);
    let t = 0;
    for (const ch of [...text].slice(0, chars)) {
      if (ch === ' ') engine.commitSpace(t);
      else engine.addChar(ch, t);
      t += stepMs;
    }
    return engine;
  }

  it('measures wpm over the fixed window, not the time actually typed', () => {
    const text = 'the cat sat on a mat and ran up and over the tall garden wall today';
    const engine = typePartial(text, 20); // ~2.3s of typing, run still mid-buffer
    engine.finish(WINDOW_MS);

    const windowed = engine.getStats({ durationOverrideMs: WINDOW_MS });
    // The server's view without the window would measure over the last
    // keystroke only - a much shorter time, so a much higher wpm.
    const naive = computeStats(text, engine.getLog());

    expect(windowed.durationMs).toBe(WINDOW_MS);
    expect(naive.durationMs).toBeLessThan(WINDOW_MS);
    expect(windowed.wpm).toBeGreaterThan(0);
    expect(windowed.wpm).toBeLessThan(naive.wpm);
  });

  it('live engine stats match a server-style replay with the same window', () => {
    const text = 'time flies when the words come fast and clean across the page tonight';
    const engine = typePartial(text, 30);
    engine.finish(WINDOW_MS);

    const live = engine.getStats({ durationOverrideMs: WINDOW_MS });
    const server = computeStats(text, engine.getLog(), { durationOverrideMs: WINDOW_MS });
    expect(server).toEqual(live);
  });

  it('per-second buckets span the whole window', () => {
    const text = 'a b c d e f g h i j k l m n o p';
    const engine = typePartial(text, 10, 200); // ~1.8s of typing
    engine.finish(WINDOW_MS);
    const buckets = computePerSecondRawWpm(text, engine.getLog(), { durationOverrideMs: WINDOW_MS });
    // 30s window → 30 one-second buckets, the idle tail all zero.
    expect(buckets).toHaveLength(30);
    expect(buckets.slice(5).every((b) => b === 0)).toBe(true);
  });

  it('finish() flips status to complete and stops further input', () => {
    const engine = typePartial('half typed buffer here', 4);
    expect(engine.status).toBe('running');
    engine.finish(WINDOW_MS);
    expect(engine.status).toBe('complete');
    const before = engine.getLog().events.length;
    engine.addChar('x', WINDOW_MS + 500); // ignored once complete
    expect(engine.getLog().events).toHaveLength(before);
  });

  it('finish() is a no-op while idle and after natural completion', () => {
    const idle = createEngine('never typed');
    idle.finish(WINDOW_MS);
    expect(idle.status).toBe('idle');

    const engine = createEngine('done');
    typeEvenly(engine, 'done', 1_000); // completes naturally on the last char
    expect(engine.status).toBe('complete');
    const before = engine.getStats();
    engine.finish(WINDOW_MS); // no-op: already complete
    expect(engine.getStats()).toEqual(before);
  });

  it('override is ignored when non-positive (falls back to natural duration)', () => {
    const engine = typePartial('abc def ghi', 7);
    const natural = engine.getStats();
    expect(engine.getStats({ durationOverrideMs: 0 })).toEqual(natural);
  });
});
