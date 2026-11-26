import { randNorm, randInt, type HasRng } from './rng';
import { PREF_KEYS, type Mind, type Preferences } from './types';

export const zeroPrefs = (): Preferences => Object.fromEntries(PREF_KEYS.map((k) => [k, 0])) as Preferences;

export function newMind(rng: HasRng): Mind {
  const quirks = zeroPrefs();
  for (const k of PREF_KEYS) quirks[k] = Math.round(randNorm(rng) * 8);
  return {
    quirks, drift: zeroPrefs(), attitudes: {}, recent: [], important: [], historical: [], counters: {},
    lastJournalId: 0, nextReview: 1 + randInt(rng, 12), urgency: 0, cache: {}, cooldowns: {},
  };
}
