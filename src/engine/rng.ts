// Générateur pseudo-aléatoire déterministe (mulberry32). L'état vit dans le
// monde : même graine + mêmes actions = même histoire, y compris après une
// sauvegarde/reprise.

export interface HasRng {
  rngState: number;
}

export function rand(w: HasRng): number {
  w.rngState = (w.rngState + 0x6d2b79f5) | 0;
  let t = w.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const randRange = (w: HasRng, a: number, b: number) => a + (b - a) * rand(w);
export const randInt = (w: HasRng, n: number) => Math.floor(rand(w) * n);
export const pick = <T>(w: HasRng, arr: readonly T[]): T => arr[randInt(w, arr.length)];

/** Tirage pondéré : c'est « la roue ». */
export function spin<T>(w: HasRng, entries: readonly (readonly [T, number])[]): T {
  let total = 0;
  for (const [, weight] of entries) total += weight;
  let r = rand(w) * total;
  for (const [value, weight] of entries) {
    r -= weight;
    if (r < 0) return value;
  }
  return entries[entries.length - 1][0];
}

/** Approximation gaussienne (somme de 4 uniformes), moyenne 0, écart-type ~1. */
export const randNorm = (w: HasRng) => (rand(w) + rand(w) + rand(w) + rand(w) - 2) * 1.732;

export const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);
