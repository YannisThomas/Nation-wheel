import { describe, expect, it } from 'vitest';
import { Director } from '../../src/agents/director';
import { buildContext } from '../../src/agents/context';
import { executeAction } from '../../src/engine/actions';
import { exactHash } from '../../src/engine/hash';
import { previewTerrain } from '../../src/engine/map';
import { climateSeason, eraMods, ERAS, harvestFactor, seasonality, tickSeason, winterSeverity } from '../../src/engine/seasons';
import { createWorld, loadWorld, saveWorld, step } from '../../src/engine/sim';
import { DEFAULT_CONFIG, MAP_STYLES, type World } from '../../src/engine/types';
import { SimHost } from '../../src/host/simhost';
import { cleanPair } from '../helpers/world';

const small = { width: 80, height: 45, nations: 16, seed: 9 };
const land = (terrain: number[]) => terrain.filter((t) => t !== 0).length / terrain.length;

describe('générateur de carte', () => {
  it('chaque type de monde respecte la part de terres et donne une carte différente', () => {
    const seen = new Set<string>();
    for (const mapStyle of MAP_STYLES) {
      for (const landFraction of [0.2, 0.5]) {
        const w = createWorld({ ...small, mapStyle, landFraction });
        expect(land(w.map.terrain), `${mapStyle} ${landFraction}`).toBeCloseTo(landFraction, 1);
        expect(w.nations.length).toBeGreaterThan(8);
        seen.add(w.map.terrain.join(''));
      }
    }
    expect(seen.size).toBe(MAP_STYLES.length * 2);
  });

  it('les formes se distinguent : pangée d\'un bloc, archipel morcelé, deux continents séparés', () => {
    const parts = (mapStyle: (typeof MAP_STYLES)[number]) => {
      const p = previewTerrain({ ...DEFAULT_CONFIG, mapStyle, seed: 7 }, 96);
      const seen = new Uint8Array(p.terrain.length);
      let count = 0; let biggest = 0;
      for (let i = 0; i < p.terrain.length; i++) {
        if (p.terrain[i] === 0 || seen[i]) continue;
        count++;
        let size = 0;
        const stack = [i];
        seen[i] = 1;
        while (stack.length) {
          const c = stack.pop()!;
          size++;
          for (const j of [c - 1, c + 1, c - p.width, c + p.width]) if (j >= 0 && j < seen.length && !seen[j] && p.terrain[j] !== 0 && Math.abs((j % p.width) - (c % p.width)) <= 1) { seen[j] = 1; stack.push(j); }
        }
        biggest = Math.max(biggest, size);
      }
      const total = p.terrain.filter((t) => t !== 0).length;
      const middle = [...Array(p.height)].filter((_, y) => p.terrain[y * p.width + (p.width >> 1)] !== 0).length;
      return { count, share: biggest / total, middle };
    };
    const pangaea = parts('pangaea');
    const archipelago = parts('archipelago');
    const two = parts('two_continents');
    expect(pangaea.share).toBeGreaterThan(0.9);
    expect(archipelago.count).toBeGreaterThan(pangaea.count * 3);
    expect(archipelago.share).toBeLessThan(0.6);
    expect(two.middle).toBeLessThan(4); // un océan sépare les deux moitiés
    expect(two.share).toBeLessThan(0.75);
  });

  it('climat, relief et ressources changent réellement le terrain', () => {
    const count = (w: World, t: number) => w.map.terrain.filter((x) => x === t).length;
    const cold = createWorld({ ...small, climate: 'cold' });
    const hot = createWorld({ ...small, climate: 'hot' });
    expect(count(cold, 6)).toBeGreaterThan(count(hot, 6)); // toundra
    expect(count(hot, 5)).toBeGreaterThan(count(cold, 5)); // désert
    expect(count(createWorld({ ...small, mountains: 1.8 }), 4)).toBeGreaterThan(count(createWorld({ ...small, mountains: 0.4 }), 4) * 2);
    const deposits = (w: World) => w.map.resource.filter((r) => r >= 0).length;
    expect(deposits(createWorld({ ...small, resources: 2 }))).toBeGreaterThan(deposits(createWorld({ ...small, resources: 0.4 })) * 2);
  });

  it('l\'aperçu a la même forme que la carte finale', async () => {
    const cfg = { ...DEFAULT_CONFIG, mapStyle: 'two_continents' as const, seed: 5 };
    const p = previewTerrain(cfg, 80);
    const full = createWorld({ ...cfg, nations: 10 });
    let same = 0;
    for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
      const fx = Math.floor((x / p.width) * full.map.width); const fy = Math.floor((y / p.height) * full.map.height);
      if ((p.terrain[y * p.width + x] === 0) === (full.map.terrain[fy * full.map.width + fx] === 0)) same++;
    }
    expect(same / p.terrain.length).toBeGreaterThan(0.9);
    const host = new SimHost(small);
    const viaHost = (await host.handle({ type: 'preview', config: { mapStyle: 'archipelago', seed: 3 } })) as { terrain: number[]; width: number };
    expect(viaHost.terrain.length).toBe(viaHost.width * Math.round((viaHost.width * 90) / 160));
    host.stop();
  });
});

describe('saisons climatiques', () => {
  it('les hémisphères sont opposés et les saisons se suivent dans l\'ordre', () => {
    const w = createWorld(small);
    const year: string[] = [];
    for (let m = 0; m < 12; m++) { year.push(climateSeason(w, 0.5)); expect(climateSeason(w, -0.5)).not.toBe(climateSeason(w, 0.5)); w.tick++; }
    expect(year.join(',')).toBe('winter,winter,spring,spring,spring,summer,summer,summer,autumn,autumn,autumn,winter');
    expect(seasonality(0)).toBe(0);
    expect(seasonality(0.9)).toBe(1);
  });

  it('l\'hiver n\'existe que là et quand il doit : latitude, mois, option', () => {
    const w = createWorld(small);
    const n = w.nations[0];
    n.geo.latitude = 0.8;
    expect(winterSeverity(w, n)).toBeGreaterThan(0.9);
    expect(harvestFactor(w, n)).toBeLessThan(1);
    w.tick = 6; // juillet
    expect(winterSeverity(w, n)).toBe(0);
    w.tick = 9; // octobre : moisson
    expect(harvestFactor(w, n)).toBeGreaterThan(1);
    w.tick = 0;
    n.geo.latitude = 0.05; // tropiques
    expect(winterSeverity(w, n)).toBe(0);
    expect(harvestFactor(w, n)).toBe(1);
    n.geo.latitude = 0.8;
    w.config.climateSeasons = false;
    expect(winterSeverity(w, n)).toBe(0);
    expect(harvestFactor(w, n)).toBe(1);
  });

  it('une offensive d\'hiver contre un pays nordique avance moins qu\'une offensive d\'été', () => {
    const gained = (startTick: number) => {
      let total = 0;
      for (const seed of [9, 10, 11, 12]) {
        const w = createWorld({ ...small, seed, eventRate: 0 });
        const [a, b] = cleanPair(w);
        w.tick = startTick;
        w.nations[b].geo.latitude = 0.85;
        w.nations[a].mil.army += 60;
        const before = w.nations[a].geo.cells;
        if (!executeAction(w, { type: 'declare_war', nation: a, target: b }).ok) continue;
        for (let i = 0; i < 3; i++) { step(w); w.nations[b].geo.latitude = 0.85; }
        total += w.nations[a].geo.cells - before;
      }
      return total;
    };
    expect(gained(5)).toBeGreaterThan(gained(11)); // juin contre décembre
  });

  it('la saison figure dans le contexte fourni au LLM', () => {
    const w = createWorld(small);
    const d = new Director();
    w.nations.forEach((n) => (n.mind.urgency = 1));
    const task = d.plan(w).find((t) => t.kind === 'proactive')!;
    const ctx = buildContext(w, task.nation, task.sit, task.ranked.map((r) => r.option));
    expect(ctx).toContain('ÈRE : saison 1 du monde, « Fondation »');
    expect(ctx).toMatch(/DATE : .*\((hiver|été) chez nous/);
  });
});

describe('saisons du monde', () => {
  it('une saison se clôt à l\'échéance, tire une ère nouvelle et l\'inscrit au journal', () => {
    const w = createWorld({ ...small, seasonYears: 5 });
    const d = new Director();
    const eras: string[] = [w.season.era];
    for (let i = 0; i < 12 * 21; i++) { const { actions } = d.decideSync(w); d.attachResults(step(w, actions)); if (w.season.era !== eras[eras.length - 1]) eras.push(w.season.era); }
    expect(w.season.number).toBe(5);
    expect(eras.length).toBe(5);
    for (let i = 1; i < eras.length; i++) { expect(eras[i]).not.toBe(eras[i - 1]); expect(eras[i]).not.toBe('foundation'); expect(ERAS[eras[i]]).toBeDefined(); }
    const entries = w.journal.filter((e) => e.type === 'season');
    expect(entries.length).toBe(4);
    expect(entries[0].text).toMatch(/Fin de la saison 1 \(Fondation\)/);
    expect(w.nations.some((n) => n.mind.important.some((m) => m.type === 'season'))).toBe(true);
  });

  it('carte pleine : la saison s\'achève aussitôt, une seule fois pour ce motif', () => {
    const w = createWorld({ ...small, seasonYears: 500 });
    for (const n of w.nations) n.geo.freeAdjacent = 0;
    tickSeason(w);
    expect(w.season.number).toBe(2);
    expect(w.journal[w.journal.length - 1].text).toContain('la carte est pleine');
    tickSeason(w);
    expect(w.season.number).toBe(2);
  });

  it('l\'ère pèse réellement sur le monde', () => {
    const run = (era: string) => {
      const w = createWorld({ ...small, seasonYears: 500, eventRate: 0 });
      w.season.era = era;
      for (let i = 0; i < 240; i++) step(w);
      const alive = w.nations.filter((n) => n.alive);
      return { gdp: alive.reduce((s, n) => s + n.gdp, 0), tech: alive.reduce((s, n) => s + n.tech, 0), pop: alive.reduce((s, n) => s + n.pop, 0), stability: alive.reduce((s, n) => s + n.stability, 0) };
    };
    const base = run('foundation');
    expect(run('depression').gdp).toBeLessThan(base.gdp * 0.97);
    expect(run('depression').stability).toBeLessThan(base.stability);
    expect(run('science').tech).toBeGreaterThan(base.tech);
    expect(run('pandemic').pop).toBeLessThan(base.pop);
    expect(run('little_ice_age').pop).toBeLessThanOrEqual(base.pop);
    expect(eraMods(createWorld(small)).growth).toBe(1);
  });

  it('reste déterministe, et les anciennes sauvegardes sont complétées', () => {
    const a = createWorld({ ...small, seasonYears: 4 });
    const b = createWorld({ ...small, seasonYears: 4 });
    for (let i = 0; i < 120; i++) { step(a); step(b); }
    expect(exactHash(a)).toBe(exactHash(b));
    const old = JSON.parse(saveWorld(a));
    delete old.season; delete old.config.mapStyle; delete old.config.climateSeasons; delete old.config.seasonYears;
    for (const n of old.nations) delete n.geo.latitude;
    const loaded = loadWorld(JSON.stringify(old));
    expect(loaded.season.number).toBe(1);
    expect(loaded.config.climateSeasons).toBe(true);
    expect(loaded.nations[0].geo.latitude).toBeTypeOf('number');
    for (let i = 0; i < 24; i++) step(loaded);
    expect(loaded.tick).toBe(144);
  });
});
