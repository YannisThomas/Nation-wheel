import { describe, expect, it } from 'vitest';
import { executeAction, validateAction } from '../../src/engine/actions';
import { exactHash, nationStateHash } from '../../src/engine/hash';
import { neighborTable } from '../../src/engine/map';
import { rand } from '../../src/engine/rng';
import { createWorld, loadWorld, saveWorld, step } from '../../src/engine/sim';
import { BUDGET_SECTORS, type Action, type Nation, type World } from '../../src/engine/types';

const small = { width: 80, height: 45, nations: 20 };

function numbersOf(n: Nation): number[] {
  const m = n.mil;
  return [n.pop, n.gdp, n.treasury, n.debt, n.tech, n.education, n.health, n.infrastructure, n.industry,
    n.stability, n.hdi, n.qualityOfLife, n.urbanization, n.taxRate, m.personnel, m.reserves, m.army, m.airforce,
    m.navy, m.tech, m.experience, m.logistics, m.power, m.mobilization, ...BUDGET_SECTORS.map((k) => n.budget[k])];
}

/** Invariants qui doivent tenir à chaque instant de n'importe quelle partie. */
function checkInvariants(world: World): void {
  for (const n of world.nations) {
    if (!n.alive) continue;
    for (const v of numbersOf(n)) {
      expect(Number.isFinite(v), `${n.name} tick ${world.tick}`).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
    expect(n.pop).toBeGreaterThanOrEqual(1000);
    expect(n.stability).toBeLessThanOrEqual(100);
    expect(n.hdi).toBeLessThanOrEqual(1);
    expect(n.tech).toBeLessThanOrEqual(120);
    expect(n.gdp * 1e9 / n.pop).toBeLessThan(250_000); // pas d'économie infinie
    expect(BUDGET_SECTORS.reduce((s, k) => s + n.budget[k], 0)).toBeCloseTo(1, 6);
  }
}

describe('génération du monde', () => {
  const world = createWorld(small);

  it('respecte la proportion de terres et place les nations', () => {
    const land = world.map.terrain.filter((t) => t !== 0).length;
    expect(land / world.map.terrain.length).toBeCloseTo(0.36, 1);
    expect(world.nations.length).toBe(20);
    for (const n of world.nations) {
      expect(n.geo.cells).toBeGreaterThan(0);
      expect(world.map.owner[n.capitalCell]).toBe(n.id);
      expect(n.pop).toBeGreaterThan(0);
      expect(n.gdp).toBeGreaterThan(0);
    }
    expect(new Set(world.nations.map((n) => n.name)).size).toBe(20);
  });

  it('ne donne jamais un océan à une nation et garde des voisinages symétriques', () => {
    world.map.owner.forEach((o, i) => { if (o >= 0) expect(world.map.terrain[i]).not.toBe(0); });
    for (const a of world.nations) {
      for (const [b, len] of Object.entries(a.geo.neighbors)) {
        expect(world.nations[+b].geo.neighbors[a.id]).toBe(len);
      }
    }
  });

  it('produit des nations variées', () => {
    const big = createWorld({ nations: 60 });
    expect(new Set(big.nations.map((n) => n.government)).size).toBeGreaterThan(4);
    const techs = big.nations.map((n) => n.tech);
    expect(Math.max(...techs) - Math.min(...techs)).toBeGreaterThan(30);
    const areas = big.nations.map((n) => n.geo.cells);
    expect(Math.max(...areas)).toBeGreaterThan(5 * Math.min(...areas));
  });

  it('a une table de voisinage hexagonale symétrique', () => {
    const nb = neighborTable(7, 6);
    for (let i = 0; i < 42; i++) {
      for (let k = 0; k < 6; k++) {
        const j = nb[i * 6 + k];
        if (j >= 0) expect([...nb.slice(j * 6, j * 6 + 6)]).toContain(i);
      }
    }
  });
});

describe('déterminisme et sauvegardes', () => {
  it('même graine → même histoire', () => {
    const a = createWorld({ ...small, seed: 7 });
    const b = createWorld({ ...small, seed: 7 });
    for (let i = 0; i < 120; i++) { step(a); step(b); }
    expect(exactHash(a)).toBe(exactHash(b));
    const c = createWorld({ ...small, seed: 8 });
    for (let i = 0; i < 120; i++) step(c);
    expect(exactHash(c)).not.toBe(exactHash(a));
  });

  it('sauvegarde puis reprise sans divergence', () => {
    const a = createWorld({ ...small, seed: 3 });
    for (let i = 0; i < 60; i++) step(a);
    const b = loadWorld(saveWorld(a));
    for (let i = 0; i < 60; i++) { step(a); step(b); }
    expect(exactHash(b)).toBe(exactHash(a));
  });

  it("refuse une sauvegarde d'une autre version", () => {
    expect(() => loadWorld('{"version":99}')).toThrow();
  });
});

describe('validation des actions', () => {
  const fresh = () => createWorld({ ...small, seed: 11 });

  it('refuse les actions invalides sans toucher au monde', () => {
    const world = fresh();
    const before = exactHash(world);
    const n = world.nations[0];
    const bad: unknown[] = [
      null, {}, { type: 'declare_victory', nation: 0 },
      { type: 'set_tax', nation: 999, rate: 0.2 },
      { type: 'set_tax', nation: 0, rate: 0.99 },
      { type: 'set_tax', nation: 0, rate: n.taxRate + 0.2 },
      { type: 'set_tax', nation: 0, rate: Number.NaN },
      { type: 'invest', nation: 0, sector: 'industry', amount: -5 },
      { type: 'invest', nation: 0, sector: 'industry', amount: n.gdp },
      { type: 'invest', nation: 0, sector: 'gdp', amount: 1 },
      { type: 'mobilize', nation: 0, level: 1 },
      { type: 'mobilize', nation: 0, level: '0.1' },
      { type: 'research', nation: 0, militaryShare: 2 },
      { type: 'set_budget', nation: 0, budget: { military: 1, research: 0, education: 0, infrastructure: 0, welfare: 0, industry: 0 } },
      { type: 'set_budget', nation: 0, budget: { military: -1 } },
    ];
    for (const a of bad) {
      const r = executeAction(world, a as Action);
      expect(r.ok, JSON.stringify(a)).toBe(false);
      expect(r.reason).toBeTruthy();
    }
    expect(exactHash(world)).toBe(before);
  });

  it('applique un investissement : le moteur calcule coût et effet', () => {
    const world = fresh();
    const n = world.nations[0];
    const amount = n.gdp * 0.05;
    const wealth = n.treasury - n.debt;
    const infra = n.infrastructure;
    const r = executeAction(world, { type: 'invest', nation: 0, sector: 'infrastructure', amount });
    expect(r.ok).toBe(true);
    expect(n.treasury - n.debt).toBeCloseTo(wealth - amount, 6);
    expect(n.infrastructure).toBeGreaterThan(infra);
    expect(r.effects!.infrastructure).toBeCloseTo(n.infrastructure - infra, 6);
  });

  it('normalise le budget et borne la mobilisation', () => {
    const world = fresh();
    const r = executeAction(world, { type: 'set_budget', nation: 1, budget: { military: 2, research: 2, education: 2, infrastructure: 2, welfare: 2, industry: 2 } });
    expect(r.ok).toBe(true);
    expect(world.nations[1].budget.military).toBeCloseTo(1 / 6, 9);
    expect(validateAction(world, { type: 'mobilize', nation: 1, level: 0.2 })).toBeNull();
    expect(validateAction(world, { type: 'mobilize', nation: 1, level: 0.6 })).not.toBeNull();
  });
});

describe('dynamiques économiques', () => {
  it('la recherche fait progresser la technologie, la mobilisation coûte au PIB', () => {
    const run = (mutate: (w: World) => void) => {
      const w = createWorld({ ...small, seed: 5, eventRate: 0 });
      mutate(w);
      for (let i = 0; i < 240; i++) step(w);
      return w.nations[2];
    };
    const base = run(() => {});
    const science = run((w) => executeAction(w, { type: 'set_budget', nation: 2, budget: { ...w.nations[2].budget, research: w.nations[2].budget.research * 4 } }));
    expect(science.tech).toBeGreaterThan(base.tech);
    const war = run((w) => { executeAction(w, { type: 'mobilize', nation: 2, level: 0.25 }); executeAction(w, { type: 'mobilize', nation: 2, level: 0.5 }); });
    expect(war.gdp).toBeLessThan(base.gdp);
    expect(war.mil.personnel).toBeGreaterThan(base.mil.personnel * 2);
    expect(war.stability).toBeLessThan(base.stability);
  });

  it("l'empreinte quantifiée ignore le bruit mais voit les changements majeurs", () => {
    const w = createWorld({ ...small, seed: 5, eventRate: 0 });
    const n = w.nations[0];
    const h = nationStateHash(n);
    n.gdp *= 1.01;
    expect(nationStateHash(n)).toBe(h);
    n.mil.mobilization = 0.5;
    expect(nationStateHash(n)).not.toBe(h);
  });
});

describe('simulations longues', () => {
  it('1000 ticks sans action : invariants respectés', () => {
    const world = createWorld({ ...small, seed: 21 });
    for (let i = 0; i < 1000; i++) {
      step(world);
      if (i % 50 === 0) checkInvariants(world);
    }
    checkInvariants(world);
    expect(world.tick).toBe(1000);
    expect(world.journal.length).toBeGreaterThan(0);
  });

  it('500 ticks sous un déluge d’actions aléatoires (valides ou non)', () => {
    const world = createWorld({ ...small, seed: 22 });
    const fuzz = { rngState: 99 };
    const r = () => rand(fuzz);
    let accepted = 0;
    for (let i = 0; i < 500; i++) {
      const actions: Action[] = [];
      for (let k = 0; k < 6; k++) {
        const nation = Math.floor(r() * 22) - 1;
        const kind = Math.floor(r() * 5);
        if (kind === 0) actions.push({ type: 'set_tax', nation, rate: r() * 0.8 });
        else if (kind === 1) actions.push({ type: 'invest', nation, sector: BUDGET_SECTORS[Math.floor(r() * 6)], amount: (r() - 0.1) * 50 });
        else if (kind === 2) actions.push({ type: 'mobilize', nation, level: r() * 1.2 });
        else if (kind === 3) actions.push({ type: 'research', nation, militaryShare: r() });
        else actions.push({ type: 'set_budget', nation, budget: { military: r(), research: r(), education: r(), infrastructure: r(), welfare: r(), industry: r() } });
      }
      accepted += step(world, actions).filter((x) => x.ok).length;
      if (i % 25 === 0) checkInvariants(world);
    }
    checkInvariants(world);
    expect(accepted).toBeGreaterThan(100);
  });

  it('10 000 ticks avec 100 nations en temps raisonnable', () => {
    const world = createWorld({ nations: 100, seed: 23 });
    const t0 = Date.now();
    for (let i = 0; i < 10000; i++) {
      step(world);
      if (i % 1000 === 0) checkInvariants(world);
    }
    checkInvariants(world);
    expect(Date.now() - t0).toBeLessThan(30000);
    expect(world.journal.length).toBeLessThanOrEqual(world.config.maxJournal);
  }, 60000);
});
