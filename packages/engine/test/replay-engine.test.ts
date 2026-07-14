import { describe, expect, it } from 'vitest';
import { createEngine, createReplayEngine } from '../src/index.ts';
import { mulberry32, randomPassage, randomRun, typeEvenly } from './helpers.ts';

/**
 * The wire log carries no typed characters (plan §7.5), so a replayed word's
 * `typed`/`extras` strings show the real char only in `correct`/`corrected`
 * slots (the reducer records `passage.text[i]` there regardless); incorrect
 * slots and extras replay as the reducer's blank placeholder instead of
 * whatever was actually typed live. That is the documented cosmetic limit -
 * compare everything a real UI reads (states, committed, activeWordIndex,
 * status) but not the raw incorrect/extra char content.
 */
function withoutUntypedChars(words: readonly { typed: string; extras: string }[]): unknown[] {
  return words.map((w) => ({ ...w, typed: w.typed.length, extras: w.extras.length }));
}

describe('ReplayEngine matches the live engine', () => {
  it('advanceTo(Infinity) yields the same final snapshot as the live engine (seeded)', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const rng = mulberry32(seed * 0x2545f491);
      const text = randomPassage(rng);
      const engine = randomRun(text, rng);
      const live = engine.getSnapshot();

      const replay = createReplayEngine(text, engine.getLog());
      replay.advanceTo(Infinity);
      const replayed = replay.getSnapshot();

      expect(replayed.status, `seed ${seed}`).toBe('complete');
      expect(replayed.status).toBe(live.status);
      expect(replayed.activeWordIndex).toBe(live.activeWordIndex);
      expect(replayed.activeCharIndex).toBe(live.activeCharIndex);
      expect(replayed.eventCount).toBe(live.eventCount);
      expect(withoutUntypedChars(replayed.words)).toEqual(withoutUntypedChars(live.words));
      // Every target-slot state (correct/incorrect/corrected/missed) matches exactly.
      for (const [wi, w] of replayed.words.entries()) {
        expect(w.states, `seed ${seed} word ${wi}`).toEqual(live.words[wi]?.states);
      }
    }
  });

  it('a worked-example run replays word-for-word identically', () => {
    const text = 'it was a dark night';
    const engine = typeEvenly(createEngine(text), text, 4000);
    const live = engine.getSnapshot();

    const replay = createReplayEngine(text, engine.getLog());
    expect(replay.durationMs).toBe(4000);
    replay.advanceTo(replay.durationMs);
    const replayed = replay.getSnapshot();

    expect(replayed).toEqual(live);
  });
});

describe('ReplayEngine incremental advancement', () => {
  const text = 'it was a dark night';

  it('advanceTo(t) only applies events with timestamp <= t', () => {
    const engine = typeEvenly(createEngine(text), text, 4000);
    const log = engine.getLog();
    const replay = createReplayEngine(text, log);

    const applied = replay.advanceTo(2000);
    expect(applied).toBe(true);
    const mid = replay.getSnapshot();
    expect(mid.status).toBe('running');
    expect(mid.eventCount).toBeLessThan(log.events.length);
    expect(mid.eventCount).toBe(log.events.filter((e) => e[0] <= 2000).length);

    const finishedApplied = replay.advanceTo(replay.durationMs);
    expect(finishedApplied).toBe(true);
    const done = replay.getSnapshot();
    expect(done.status).toBe('complete');
    expect(done.eventCount).toBe(log.events.length);
  });

  it('advanceTo returns false once nothing new applies', () => {
    const engine = typeEvenly(createEngine(text), text, 4000);
    const replay = createReplayEngine(text, engine.getLog());
    replay.advanceTo(replay.durationMs);
    expect(replay.done).toBe(true);
    expect(replay.advanceTo(replay.durationMs)).toBe(false);
    expect(replay.advanceTo(replay.durationMs + 1000)).toBe(false);
  });

  it('advanceTo(0) applies only the (single) t=0 event, not the rest', () => {
    const engine = typeEvenly(createEngine(text), text, 4000);
    const replay = createReplayEngine(text, engine.getLog());
    replay.advanceTo(0);
    const snap = replay.getSnapshot();
    expect(snap.status).toBe('running');
    expect(snap.eventCount).toBe(1);
  });
});

describe('ReplayEngine status transitions', () => {
  const text = 'ab cd';

  it('idle -> running -> complete, and restart() returns to idle', () => {
    const engine = typeEvenly(createEngine(text), text, 1000);
    const log = engine.getLog();
    const replay = createReplayEngine(text, log);

    expect(replay.getSnapshot().status).toBe('idle');
    expect(replay.done).toBe(false);

    replay.advanceTo(log.events[0]?.[0] ?? 0);
    expect(replay.getSnapshot().status).toBe('running');

    replay.advanceTo(replay.durationMs);
    expect(replay.getSnapshot().status).toBe('complete');

    replay.restart();
    expect(replay.getSnapshot().status).toBe('idle');
    expect(replay.done).toBe(false);

    replay.advanceTo(replay.durationMs);
    const final = replay.getSnapshot();
    expect(final.status).toBe('complete');
    expect(final).toEqual(engine.getSnapshot());
  });

  it('an empty log stays idle and done even without advancing', () => {
    const replay = createReplayEngine(text, { v: 1, events: [] });
    expect(replay.durationMs).toBe(0);
    expect(replay.done).toBe(true);
    expect(replay.getSnapshot().status).toBe('idle');
    expect(replay.advanceTo(1000)).toBe(false);
  });
});

describe('ReplayEngine word-snapshot reference identity', () => {
  it('untouched later words keep snapshot identity across getSnapshot() calls', () => {
    const text = 'it was a dark night';
    const engine = typeEvenly(createEngine(text), text, 4000);
    const log = engine.getLog();
    const replay = createReplayEngine(text, log);

    // Advance only into word 0 ("it"), well before "night" is touched.
    const firstWordEndT = log.events.find((e) => e[1] === 2)?.[0] ?? 0; // the space after "it"
    replay.advanceTo(firstWordEndT);

    const snap1 = replay.getSnapshot();
    const lastWordIndex = snap1.words.length - 1;
    const untouched1 = snap1.words[lastWordIndex];

    // Advance further, still without touching the last word.
    replay.advanceTo(firstWordEndT + 1);
    const snap2 = replay.getSnapshot();
    const untouched2 = snap2.words[lastWordIndex];

    expect(untouched2).toBe(untouched1); // same reference: never invalidated

    // Once the run completes, the last word's snapshot must have changed.
    replay.advanceTo(replay.durationMs);
    const snap3 = replay.getSnapshot();
    expect(snap3.words[lastWordIndex]).not.toBe(untouched1);
  });
});
