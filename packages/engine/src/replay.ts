import type { CharEvent, CharEvents } from '@typeprose/schema';
import { MalformedLogError } from './errors.ts';
import { parsePassage, type ParsedPassage } from './passage.ts';
import {
  applyEvent,
  createRunState,
  isWordFullyCorrect,
  type ApplyResult,
  type RunState,
} from './state.ts';

/** One run's stats (plan §7.3). Structurally identical to the schema's RunStats. */
export interface RunStats {
  wpm: number;
  rawWpm: number;
  accuracy: number;
  consistency: number;
  durationMs: number;
}

/**
 * Monkeytype's consistency transfer function, verified verbatim against
 * monkeytype `packages/util/src/numbers.ts`:
 * `100 * (1 - tanh(cov + cov^3/3 + cov^5/5))`.
 */
export function kogasa(cov: number): number {
  return 100 * (1 - Math.tanh(cov + Math.pow(cov, 3) / 3 + Math.pow(cov, 5) / 5));
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/** Population standard deviation (divide by n), as Monkeytype's stdDev does. */
function stdDev(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  let sq = 0;
  for (const v of values) sq += (v - m) * (v - m);
  return Math.sqrt(sq / values.length);
}

function roundTo2(x: number): number {
  return Math.round(x * 100) / 100;
}

/**
 * Replay a charEvents log against a parsed passage, validating every event.
 *
 * @param onEvent optional visitor called after each event is applied.
 * @throws MalformedLogError subclasses on any log a real run could not produce.
 */
export function replayEvents(
  passage: ParsedPassage,
  log: CharEvents,
  onEvent?: (event: CharEvent, result: ApplyResult) => void,
): RunState {
  assertSupportedLogVersion(log);
  const state = createRunState(passage);
  for (const event of log.events) {
    const result = applyEvent(passage, state, event);
    onEvent?.(event, result);
  }
  return state;
}

/** @throws MalformedLogError on any wire version this engine cannot replay. */
export function assertSupportedLogVersion(log: CharEvents): void {
  if ((log.v as number) !== 1) {
    throw new MalformedLogError(`unsupported charEvents version ${String(log.v)}`);
  }
}

/**
 * First-attempt latency and error-touch accounting per passage index, shared
 * by the heatmap (per-index, §7.6) and key-stats (per-expected-char, §4)
 * aggregations. Chain rules: backspaces are not keypresses and do not advance
 * the previous-keypress clock; latency is attributed on the first attempt at
 * a target index (slot chars and committed spaces); extras and over-cap
 * presses have no target char but still advance the clock.
 */
export interface FirstAttemptAccounting {
  /** First-attempt inter-key interval per index; null when never attempted or the run's first keypress. */
  latency: (number | null)[];
  /** Incorrect keypresses that touched each index. */
  errorTouches: number[];
  /** Whether a first attempt landed on each index. */
  attempted: boolean[];
}

/** @throws InvalidPassageError | MalformedLogError */
export function firstAttemptAccounting(
  passage: ParsedPassage,
  log: CharEvents,
): FirstAttemptAccounting {
  const latency = new Array<number | null>(passage.length).fill(null);
  const errorTouches = new Array<number>(passage.length).fill(0);
  const attempted = new Array<boolean>(passage.length).fill(false);
  let prevKeyT: number | null = null;

  replayEvents(passage, log, (event, result) => {
    if (
      result.kind === 'delete-slot' ||
      result.kind === 'delete-extra' ||
      result.kind === 'uncommit'
    ) {
      return; // backspaces are not keypresses and do not advance the chain
    }
    const [t, i] = event;
    // Latency is attributed on the first attempt at a target index (slot chars
    // and the space itself); extras/over-cap presses have no target char.
    if ((result.kind === 'add-slot' || result.kind === 'commit') && attempted[i] !== true) {
      attempted[i] = true;
      if (prevKeyT !== null) latency[i] = t - prevKeyT;
    }
    if (result.correct === false) errorTouches[i] = (errorTouches[i] ?? 0) + 1;
    prevKeyT = t; // every keypress (extras and over-cap included) advances the chain
  });

  return { latency, errorTouches, attempted };
}

/**
 * Per-1-second raw-wpm buckets (plan §7.3 consistency, §9.3 sparkline).
 * Buckets: `max(1, ceil(durationMs / 1000))`; each raw-contributing keypress
 * lands in `floor(t / 1000)` clamped into the last bucket; a bucket's raw wpm
 * is `chars * 12` (chars/sec ÷ 5 chars-per-word × 60); the partial last
 * second is not scaled.
 */
function perSecondRawFrom(times: readonly number[], durationMs: number): number[] {
  if (times.length === 0) return [];
  const bucketCount = Math.max(1, Math.ceil(durationMs / 1000));
  const counts = new Array<number>(bucketCount).fill(0);
  for (const t of times) {
    const b = Math.min(Math.floor(t / 1000), bucketCount - 1);
    counts[b] = (counts[b] ?? 0) + 1;
  }
  return counts.map((n) => n * 12);
}

function consistencyFrom(times: readonly number[], durationMs: number): number {
  const perSecond = perSecondRawFrom(times, durationMs);
  if (perSecond.length === 0) return 100;
  const m = mean(perSecond);
  if (m <= 0) return 100;
  const cov = stdDev(perSecond) / m;
  return Math.min(100, Math.max(0, kogasa(cov)));
}

function runDurationMs(state: RunState): number {
  return state.completedAtT ?? (state.eventCount > 0 ? state.lastT : 0);
}

/**
 * Options for the stat functions. `durationOverrideMs` fixes the run's duration
 * to an externally supplied window (timed mode, §2.3): WPM is then measured over
 * that fixed window rather than the time of the last keystroke, and the
 * per-second buckets span it. The server reproduces the identical figure by
 * passing the same window from the submission, so the wire recompute still
 * matches. Ignored (falls back to the natural completion/last-keystroke
 * duration) when absent or non-positive.
 */
export interface StatsOptions {
  durationOverrideMs?: number | undefined;
}

function effectiveDurationMs(state: RunState, opts?: StatsOptions): number {
  const override = opts?.durationOverrideMs;
  if (override !== undefined && override > 0) return override;
  return runDurationMs(state);
}

/**
 * Derive §7.3 stats from a replayed (or live) run state. Values are rounded
 * to 2 decimals; an untouched run reports 0 wpm and the default 100 accuracy.
 */
export function statsFromState(
  passage: ParsedPassage,
  state: RunState,
  opts?: StatsOptions,
): RunStats {
  const durationMs = effectiveDurationMs(state, opts);
  const minutes = durationMs / 60_000;

  // charsInCorrectWords + correctSpaces: every char of words whose final
  // committed state is fully correct, plus the space following each such word
  // (the final word contributes no space). Plan §7.3.
  let correctChars = 0;
  const lastIndex = passage.words.length - 1;
  for (let wi = 0; wi < passage.words.length; wi += 1) {
    const word = passage.words[wi] as (typeof passage.words)[number];
    const ws = state.words[wi] as (typeof state.words)[number];
    if (wi === lastIndex) {
      if (isWordFullyCorrect(word, ws)) correctChars += word.text.length;
    } else if (ws.committed && ws.committedCorrect) {
      correctChars += word.text.length + 1;
    }
  }

  const wpm = minutes > 0 ? roundTo2(correctChars / 5 / minutes) : 0;
  const rawWpm = minutes > 0 ? roundTo2(state.rawChars / 5 / minutes) : 0;
  const keypresses = state.correctKeypresses + state.incorrectKeypresses;
  const accuracy = keypresses > 0 ? roundTo2((100 * state.correctKeypresses) / keypresses) : 100;
  const consistency = roundTo2(consistencyFrom(state.rawEventTimes, durationMs));
  return { wpm, rawWpm, accuracy, consistency, durationMs };
}

/**
 * Pure replay: reconstruct the run from the log alone and compute §7.3 stats.
 * The client and the server call this same function; the live engine's
 * getStats() derives from the identical reducer state. `opts.durationOverrideMs`
 * fixes the window for timed mode (see {@link StatsOptions}).
 *
 * @throws InvalidPassageError | MalformedLogError
 */
export function computeStats(
  passageText: string,
  log: CharEvents,
  opts?: StatsOptions,
): RunStats {
  const passage = parsePassage(passageText);
  const state = replayEvents(passage, log);
  return statsFromState(passage, state, opts);
}

/**
 * The per-1-second raw wpm series for the wpm-over-time sparkline (§7.5).
 * Same buckets as the consistency computation. Empty log → empty array.
 * `opts.durationOverrideMs` spans the fixed window for timed mode, so the
 * sparkline covers the whole run rather than stopping at the last keystroke.
 */
export function computePerSecondRawWpm(
  passageText: string,
  log: CharEvents,
  opts?: StatsOptions,
): number[] {
  const passage = parsePassage(passageText);
  const state = replayEvents(passage, log);
  return perSecondRawFrom(state.rawEventTimes, effectiveDurationMs(state, opts));
}
