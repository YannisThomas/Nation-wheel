import { clamp, rand, randInt, type HasRng } from './rng';
import { RESOURCES, TERRAINS, type Geo, type Nation, type Resource, type MapStyle, type SimConfig, type Terrain, type World, type WorldMap } from './types';

const T = Object.fromEntries(TERRAINS.map((t, i) => [t, i])) as Record<Terrain, number>;
export const OCEAN = T.ocean;

// ---- Voisinage hexagonal (grille décalée « odd-r »), mis en cache par taille ----

const neighborCache = new Map<string, Int32Array>();

export function neighborTable(width: number, height: number): Int32Array {
  const key = `${width}x${height}`;
  let table = neighborCache.get(key);
  if (table) return table;
  table = new Int32Array(width * height * 6).fill(-1);
  const even = [[-1, 0], [1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]];
  const odd = [[-1, 0], [1, 0], [0, -1], [1, -1], [0, 1], [1, 1]];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offs = y % 2 ? odd : even;
      for (let k = 0; k < 6; k++) {
        const nx = x + offs[k][0];
        const ny = y + offs[k][1];
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) table[(y * width + x) * 6 + k] = ny * width + nx;
      }
    }
  }
  neighborCache.set(key, table);
  return table;
}

// ---- Bruit de valeur fractal ----

function lattice(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = lattice(ix, iy, seed);
  const b = lattice(ix + 1, iy, seed);
  const c = lattice(ix, iy + 1, seed);
  const d = lattice(ix + 1, iy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x: number, y: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let o = 0; o < 5; o++) {
    sum += amp * noise(x * freq, y * freq, seed + o * 101);
    amp *= 0.5;
    freq *= 2;
  }
  return sum;
}

/**
 * Forme générale des terres. `noise(f)` est le relief fractal à la fréquence f ;
 * dx et dy vont de -1 à 1. Les coordonnées étant normalisées, un aperçu en basse
 * résolution a la même forme que la carte finale.
 */
function shape(style: MapStyle | undefined, dx: number, dy: number, noise: (f: number) => number): number {
  const edge = Math.max(Math.abs(dx) ** 4, Math.abs(dy) ** 3);
  const r = Math.hypot(dx * 0.9, dy);
  switch (style) {
    case 'pangaea': return noise(1) * 0.55 + (1 - r) * 0.5 - edge * 0.3;
    case 'archipelago': return noise(3) - edge * 0.1;
    case 'two_continents': return noise(1) * 0.7 + 0.3 * Math.max(Math.exp(-(((dx + 0.5) / 0.3) ** 2)), Math.exp(-(((dx - 0.5) / 0.3) ** 2))) - 0.35 * Math.exp(-((dx / 0.13) ** 2)) - edge * 0.45;
    case 'inland_sea': return noise(1) * 0.6 + 0.45 * Math.min(1, r * 1.3) - 0.5 * Math.exp(-((r / 0.3) ** 2)) - edge * 0.75;
    default: return noise(1) - edge * 0.45;
  }
}

/** Terrain seul, en basse résolution : sert à l'aperçu du générateur de carte. */
export function previewTerrain(cfg: SimConfig, width = 96): { width: number; height: number; terrain: number[] } {
  const height = Math.round((width * cfg.height) / cfg.width);
  const map = generateMap({ ...cfg, width, height, resources: 0 }, { rngState: cfg.seed | 0 });
  return { width, height, terrain: map.terrain };
}

const BASE_FERTILITY: Record<Terrain, number> = {
  ocean: 0, plains: 0.9, forest: 0.5, hills: 0.4, mountain: 0.1, desert: 0.05, tundra: 0.08,
};

/** Probabilité de gisement par terrain et les ressources qu'on y trouve. */
const DEPOSITS: Record<Terrain, [number, Resource[]]> = {
  ocean: [0, []],
  plains: [0.03, ['oil', 'gas', 'coal']],
  forest: [0.04, ['coal', 'iron', 'copper']],
  hills: [0.08, ['iron', 'coal', 'copper', 'gold']],
  mountain: [0.1, ['gold', 'copper', 'rare_earths', 'uranium', 'iron']],
  desert: [0.07, ['oil', 'gas', 'rare_earths', 'uranium']],
  tundra: [0.05, ['gas', 'oil', 'gold']],
};

const TOTAL_LAND_KM2 = 130e6;

export function generateMap(cfg: SimConfig, rng: HasRng): WorldMap {
  const { width, height } = cfg;
  const n = width * height;
  const seed = cfg.seed | 0;
  const elevation = new Array<number>(n);
  const scale = 5 / height;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x / width) * 2 - 1;
      const dy = (y / height) * 2 - 1;
      // Atténuation vers les bords : les continents ne touchent pas le cadre.
      elevation[y * width + x] = shape(cfg.mapStyle, dx, dy, (f) => fbm(x * scale * f, y * scale * f, seed));
    }
  }
  const sorted = [...elevation].sort((a, b) => a - b);
  const seaLevel = sorted[Math.floor(n * (1 - cfg.landFraction))];
  const landElev = sorted.filter((e) => e > seaLevel);
  const relief = clamp(cfg.mountains ?? 1, 0, 2);
  const mountainLevel = landElev[Math.floor(landElev.length * (1 - 0.08 * relief))] ?? Infinity;
  const hillLevel = landElev[Math.floor(landElev.length * (1 - 0.24 * relief))] ?? Infinity;
  const warmth = cfg.climate === 'cold' ? -0.2 : cfg.climate === 'hot' ? 0.2 : 0;

  const terrain = new Array<number>(n);
  const fertility = new Array<number>(n);
  const river = new Array<number>(n).fill(0);
  const resource = new Array<number>(n).fill(-1);
  const nb = neighborTable(width, height);
  let land = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const e = elevation[i];
      let t: Terrain;
      if (e <= seaLevel) t = 'ocean';
      else {
        land++;
        const latitude = Math.abs((y / (height - 1)) * 2 - 1); // 0 équateur, 1 pôles
        const moisture = fbm(x * scale * 1.7 + 50, y * scale * 1.7 + 50, seed + 999);
        const temp = 1 - latitude - (e - seaLevel) * 0.6 + warmth;
        if (e > mountainLevel) t = 'mountain';
        else if (temp < 0.18) t = 'tundra';
        else if (e > hillLevel) t = 'hills';
        else if (moisture < 0.4 && temp > 0.45) t = 'desert';
        else if (moisture > 0.53) t = 'forest';
        else t = 'plains';
      }
      terrain[i] = T[t];
    }
  }

  // Fleuves : descente depuis des sources en altitude jusqu'à la mer.
  const sources = Math.floor(land / 220);
  for (let s = 0; s < sources; s++) {
    let i = randInt(rng, n);
    if (terrain[i] !== T.mountain && terrain[i] !== T.hills) continue;
    for (let step = 0; step < 200 && terrain[i] !== OCEAN; step++) {
      river[i] = 1;
      let best = -1;
      for (let k = 0; k < 6; k++) {
        const j = nb[i * 6 + k];
        if (j >= 0 && (best < 0 || elevation[j] < elevation[best])) best = j;
      }
      if (best < 0 || elevation[best] >= elevation[i]) break;
      i = best;
    }
  }

  for (let i = 0; i < n; i++) {
    const t = TERRAINS[terrain[i]];
    if (t === 'ocean') {
      fertility[i] = 0;
      continue;
    }
    let coastal = false;
    for (let k = 0; k < 6; k++) {
      const j = nb[i * 6 + k];
      if (j >= 0 && terrain[j] === OCEAN) coastal = true;
    }
    fertility[i] = clamp(BASE_FERTILITY[t] + (river[i] ? 0.3 : 0) + (coastal ? 0.1 : 0), 0, 1);
    const [p, kinds] = DEPOSITS[t];
    if (rand(rng) < p * clamp(cfg.resources ?? 1, 0, 2)) resource[i] = RESOURCES.indexOf(kinds[randInt(rng, kinds.length)]);
  }

  return {
    width, height, cellAreaKm2: TOTAL_LAND_KM2 / Math.max(1, land),
    elevation: elevation.map((e) => Math.round(e * 1000) / 1000),
    terrain, fertility, river, resource, owner: new Array<number>(n).fill(-1),
  };
}

// ---- Géographie dérivée des nations : recalculée seulement quand les frontières bougent ----

function emptyGeo(): Geo {
  return {
    cells: 0, areaKm2: 0, coastCells: 0, coastlineKm: 0, landlocked: true,
    terrain: Object.fromEntries(TERRAINS.map((t) => [t, 0])) as Record<Terrain, number>,
    riverCells: 0, parts: 0, fertility: 0,
    resources: Object.fromEntries(RESOURCES.map((r) => [r, 0])) as Record<Resource, number>,
    neighbors: {}, strategic: 0, freeAdjacent: 0, latitude: 0,
  };
}

export function recomputeGeo(world: World): void {
  const { map, nations } = world;
  const nb = neighborTable(map.width, map.height);
  const geos = nations.map(() => emptyGeo());
  const n = map.width * map.height;
  const cellKm = Math.sqrt(map.cellAreaKm2);

  for (let i = 0; i < n; i++) {
    const o = map.owner[i];
    if (o < 0) {
      if (map.terrain[i] === OCEAN) continue;
      let last = -1;
      for (let k = 0; k < 6; k++) {
        const j = nb[i * 6 + k];
        const p = j >= 0 ? map.owner[j] : -1;
        if (p >= 0 && p !== last) { geos[p].freeAdjacent++; last = p; }
      }
      continue;
    }
    const g = geos[o];
    g.cells++;
    g.latitude += 1 - (2 * Math.floor(i / map.width)) / Math.max(1, map.height - 1);
    g.terrain[TERRAINS[map.terrain[i]]]++;
    g.fertility += map.fertility[i];
    if (map.river[i]) g.riverCells++;
    if (map.resource[i] >= 0) g.resources[RESOURCES[map.resource[i]]]++;
    let coast = 0;
    for (let k = 0; k < 6; k++) {
      const j = nb[i * 6 + k];
      if (j < 0) continue;
      if (map.terrain[j] === OCEAN) coast++;
      else {
        const p = map.owner[j];
        if (p >= 0 && p !== o) g.neighbors[p] = (g.neighbors[p] ?? 0) + 1;
      }
    }
    if (coast) {
      g.coastCells++;
      g.coastlineKm += coast * cellKm * 0.6;
    }
  }

  // Composantes connexes (îles, exclaves).
  const seen = new Uint8Array(n);
  const stack: number[] = [];
  for (let i = 0; i < n; i++) {
    const o = map.owner[i];
    if (o < 0 || seen[i]) continue;
    geos[o].parts++;
    stack.push(i);
    seen[i] = 1;
    while (stack.length) {
      const c = stack.pop()!;
      for (let k = 0; k < 6; k++) {
        const j = nb[c * 6 + k];
        if (j >= 0 && !seen[j] && map.owner[j] === o) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
  }

  for (const nation of nations) {
    const g = geos[nation.id];
    g.areaKm2 = g.cells * map.cellAreaKm2;
    g.latitude = g.cells ? g.latitude / g.cells : 0;
    g.landlocked = g.coastCells === 0;
    if (g.cells > 0) for (const t of TERRAINS) g.terrain[t] /= g.cells;
    g.coastlineKm = Math.round(g.coastlineKm);
    const coastShare = g.cells ? g.coastCells / g.cells : 0;
    g.strategic = Math.round(clamp(
      25 + 40 * Math.min(1, coastShare * 2) + 4 * Math.min(6, Object.keys(g.neighbors).length) +
      15 * Math.min(1, g.riverCells / Math.max(1, g.cells) * 4) - (g.landlocked ? 15 : 0), 0, 100));
    nation.geo = g;
    if (g.cells === 0 && nation.alive) nation.alive = false;
  }
  world.geoDirty = false;
}

/** Capacité de charge alimentaire (habitants), avant commerce. */
export function carryingCapacity(nation: Nation, map: WorldMap): number {
  return nation.geo.fertility * map.cellAreaKm2 * 40 * (1 + nation.tech / 30) * nation.capacityFactor;
}
