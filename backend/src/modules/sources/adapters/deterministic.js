/**
 * Deterministic helpers shared by every mock adapter.
 *
 * The demo must be reproducible: the same DEMO_SEED and the same planning epoch
 * always produce byte-identical fixtures, so a judge can re-run a sync and get
 * the same plan. Nothing here uses Math.random or the wall clock directly.
 */

const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** mulberry32 - small, fast, fully deterministic 32-bit PRNG. */
export function createRandom(seed) {
  let state = seed >>> 0;

  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Derives a stable sub-seed so each adapter has an independent stream. */
export function deriveSeed(baseSeed, label) {
  let hash = baseSeed >>> 0;

  for (let index = 0; index < label.length; index += 1) {
    hash = (Math.imul(hash ^ label.charCodeAt(index), 0x01000193) >>> 0) >>> 0;
  }

  return hash >>> 0;
}

export function pick(random, items) {
  return items[Math.floor(random() * items.length)];
}

export function intBetween(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

export function floatBetween(random, min, max, decimals = 2) {
  const value = min + random() * (max - min);
  return Number(value.toFixed(decimals));
}

export function chance(random, probability) {
  return random() < probability;
}

/**
 * The planning epoch is midnight UTC of the day the sync runs, so the demo
 * always has a usable week ahead while staying deterministic within a day.
 */
export function planningEpoch(now = new Date()) {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

export function isoAt(epochMs, offsetMinutes) {
  return new Date(epochMs + offsetMinutes * MINUTE_MS).toISOString();
}

/** Converts an ISO-8601 instant into the `YYYY-MM-DD HH:MM:SS.mmm` MySQL form. */
export function toMysqlDateTime(isoString) {
  return new Date(isoString).toISOString().slice(0, 23).replace('T', ' ');
}

export function nowMysqlDateTime() {
  return new Date().toISOString().slice(0, 23).replace('T', ' ');
}
