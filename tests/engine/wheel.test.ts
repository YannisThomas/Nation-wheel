import { describe, expect, it } from 'vitest';
import { Director } from '../../src/agents/director';
import { proactiveOptions } from '../../src/agents/options';
import { preferences } from '../../src/agents/profile';
import { SEASON1 } from '../../src/data/season1';
import { executeAction } from '../../src/engine/actions';
import { exactHash } from '../../src/engine/hash';
import { createWorld, step } from '../../src/engine/sim';
import { warBetween } from '../../src/engine/war';
import { NO_TRAIT, ratingLabel, wheelDraws } from '../../src/engine/wheel';
import { cleanPair } from '../helpers/world';

describe('tirage de la roue', () => {
  it('chaque nation reçoit régime, économie, classe militaire et note sur 11', () => {
    const w = createWorld({ nations: 60, seed: 4 });
    const ratings = new Set<number>();
    for (const n of w.nations) {
      expect(n.wheel.government).toBeTruthy();
      expect(n.wheel.economy).toBeTruthy();
      expect(n.wheel.militaryClass).toBeTruthy();
      expect(n.wheel.militaryRating).toBeGreaterThanOrEqual(0);
      expect(n.wheel.militaryRating).toBeLessThanOrEqual(11);
      ratings.add(n.wheel.militaryRating);
      if (n.geo.landlocked) expect(n.wheel.tags).not.toContain('maritime');
    }
    expect(ratings.size).toBeGreaterThan(5);
    // Une meilleure note correspond bien à une armée plus forte.
    const sorted = [...w.nations].sort((a, b) => a.mil.power - b.mil.power);
    expect(sorted[sorted.length - 1].wheel.militaryRating).toBeGreaterThan(sorted[0].wheel.militaryRating);
  });

  it('les traits tirés pèsent sur la personnalité', () => {
    const w = createWorld({ nations: 20, seed: 4, width: 80, height: 45 });
    const n = w.nations[0];
    n.wheel.tags = [];
    const base = preferences(w, n);
    n.wheel.tags = ['pacifist'];
    expect(preferences(w, n).offensive).toBeLessThan(base.offensive || 1);
    n.wheel.tags = ['expansionist'];
    expect(preferences(w, n).expansion).toBeGreaterThanOrEqual(base.expansion);
  });
});

describe('colonies et protectorats', () => {
  const setup = () => {
    const w = createWorld({ nations: 20, seed: 4, width: 80, height: 45, eventRate: 0 });
    const [lord, vassal] = cleanPair(w);
    w.nations[vassal].overlord = lord;
    w.nations[vassal].colony = true;
    return { w, lord, vassal };
  };

  it('une colonie verse un tribut et ne mène pas sa propre politique étrangère', () => {
    const { w, lord, vassal } = setup();
    const third = w.nations.find((n) => n.id !== lord && n.id !== vassal && n.overlord < 0)!.id;
    expect(executeAction(w, { type: 'declare_war', nation: vassal, target: third }).reason).toMatch(/tutelle/);
    expect(executeAction(w, { type: 'propose', nation: vassal, target: third, kind: 'defense_pact' }).reason).toMatch(/colonie/);
    expect(executeAction(w, { type: 'declare_war', nation: lord, target: vassal }).reason).toMatch(/tutelle/);
    const free = createWorld({ nations: 20, seed: 4, width: 80, height: 45, eventRate: 0 });
    for (let i = 0; i < 12; i++) { step(w); step(free); }
    expect(w.nations[lord].treasury).toBeGreaterThan(free.nations[lord].treasury);
    expect(w.nations[vassal].sphereOf).toBe(lord);
  });

  it('la puissance tutélaire défend sa colonie', () => {
    const { w, lord, vassal } = setup();
    const attacker = w.nations.find((n) => n.id !== lord && n.id !== vassal && n.overlord < 0 && !w.nations.some((o) => o.overlord === n.id))!.id;
    w.nations[attacker].mil.navy = 50; // peut atteindre sa cible par la mer si besoin
    const r = executeAction(w, { type: 'declare_war', nation: attacker, target: vassal });
    if (!r.ok) return; // cible hors de portée sur cette carte
    expect(warBetween(w, attacker, lord)).toBeDefined();
  });

  it('indépendance : accordée si la métropole est faible, réprimée sinon', () => {
    for (const weak of [true, false]) {
      const { w, lord, vassal } = setup();
      expect(proactiveOptions(w, w.nations[vassal]).some((o) => o.id === 'declare_independence')).toBe(true);
      if (weak) w.nations[lord].stability = 20; else { w.nations[lord].stability = 80; w.nations[lord].mil.army += 500; w.nations[lord].mil.power *= 20; }
      expect(executeAction(w, { type: 'declare_independence', nation: vassal }).ok).toBe(true);
      expect(w.nations[vassal].overlord).toBe(-1);
      expect(!!warBetween(w, lord, vassal)).toBe(!weak);
      expect(w.journal.some((e) => e.type === 'independence')).toBe(true);
      expect(executeAction(w, { type: 'declare_independence', nation: vassal }).ok).toBe(false);
    }
  });
});

describe('saison 1 de Nation Wheel', () => {
  it('reprend les tirages du wiki : noms, populations, PIB, classes militaires, statuts', () => {
    const w = createWorld({ roster: 'season1', seed: 2 });
    expect(w.nations.length).toBe(SEASON1.length);
    const by = (name: string) => w.nations.find((n) => n.name === name)!;
    const src = (name: string) => SEASON1.find((e) => e.name === name)!;
    for (const e of SEASON1) {
      const n = by(e.name);
      expect(n, e.name).toBeDefined();
      expect(n.pop).toBe(Math.max(1000, e.pop));
      expect(n.wheel.government).toBe(e.gov);
      expect(n.geo.cells).toBeGreaterThan(0);
    }
    // PIB tiré respecté quand le niveau technologique permet de l'atteindre.
    let close = 0;
    const withGdp = SEASON1.filter((e) => e.gdp !== null);
    for (const e of withGdp) {
      const ratio = by(e.name).gdp / e.gdp!;
      const capped = by(e.name).tech > 111 || by(e.name).tech < 4; // PIB par habitant hors de portée du moteur
      if (!capped) { expect(ratio, e.name).toBeGreaterThan(0.85); expect(ratio, e.name).toBeLessThan(1.15); close++; }
    }
    expect(close).toBeGreaterThan(withGdp.length * 0.7);
    expect(src('Fredya').gdp).toBe(2500);
    // Superficies : l'ordre de grandeur relatif est conservé.
    expect(by('Maronia').geo.cells).toBeGreaterThan(by('Daroille').geo.cells * 10);
    // Statuts : colonie, guerre en cours, bloc.
    expect(by('Imeria').overlord).toBe(by('Vienzerna').id);
    expect(by('Imeria').colony).toBe(true);
    expect(warBetween(w, by('Melandia').id, by('Great Lithuania').id)).toBeDefined();
    expect(by('Isma').mil.power).toBeLessThan(by('Belvion').mil.power / 20); // « None 0/11 » contre « Continental Power 9/11 »
    expect(Object.values(w.relations).filter((r) => r.defense_pact >= 0).length).toBeGreaterThan(20);
  });

  it('est déterministe et tient 600 ticks avec agents sans valeur absurde', () => {
    const a = createWorld({ roster: 'season1', seed: 2 });
    const b = createWorld({ roster: 'season1', seed: 2 });
    expect(exactHash(a)).toBe(exactHash(b));
    const d = new Director();
    for (let i = 0; i < 600; i++) { const { actions } = d.decideSync(a); d.attachResults(step(a, actions)); }
    for (const n of a.nations.filter((x) => x.alive)) {
      for (const v of [n.pop, n.gdp, n.mil.power, n.stability, n.treasury, n.debt]) expect(Number.isFinite(v) && v >= 0, n.name).toBe(true);
      expect((n.gdp * 1e9) / n.pop).toBeLessThan(400_000);
    }
    expect(a.nations.filter((n) => n.alive).length).toBeGreaterThan(50);
  }, 60000);
});

describe('tirages montrés avant la partie', () => {
  it('monde aléatoire : chaque tirage figure sur sa roue et correspond au monde créé', () => {
    const w = createWorld({ nations: 60, seed: 4 });
    const before = exactHash(w);
    const { pools, draws } = wheelDraws(w);
    expect(exactHash(w)).toBe(before);
    expect(draws).toHaveLength(60);
    expect(pools.trait).toContain(NO_TRAIT);
    expect(pools.start.reduce((a, [, x]) => a + x, 0)).toBe(100);
    const kinds = new Set<string>();
    for (const d of draws) {
      const n = w.nations[d.id];
      expect(pools.government).toContain(d.government);
      expect(pools.economy).toContain(d.economy);
      for (const t of d.tags) expect(pools.trait).toContain(t);
      expect(d.rating).toBe(n.wheel.militaryRating);
      expect(ratingLabel(d.rating)).toMatch(/^\d+ \/ 11$/);
      expect(d.start).toBeDefined();
      expect(pools.start.map(([l]) => l)).toContain(d.start!.segment);
      kinds.add(d.start!.segment);
      const s = n.wheel.start!;
      // Le statut annoncé est celui que le moteur a réellement appliqué.
      if (s.kind === 'colony' || s.kind === 'protectorate') expect(n.overlord === s.target).toBe(s.applied);
      if (s.kind === 'colony' && s.applied) expect(d.start!.text).toBe(`Colonie de ${w.nations[s.target].name}`);
      if (!s.applied) expect(d.start!.text).toMatch(/sans effet/);
    }
    expect(kinds.size).toBeGreaterThan(3);
  });

  it('saison 1 : les roues reprennent les tirages du wiki', () => {
    const w = createWorld({ roster: 'season1', seed: 1 });
    const { pools, draws } = wheelDraws(w);
    expect(draws).toHaveLength(SEASON1.length);
    expect(draws[0].government).toBe(SEASON1[0].gov);
    expect(draws[0].start!.text).toBe('Colonie de Moravia');
    for (const d of draws) {
      expect(pools.government).toContain(d.government);
      expect(pools.rating.map(([l]) => l)).toContain(ratingLabel(d.rating));
      expect(pools.start.map(([l]) => l)).toContain(d.start!.segment);
    }
  });
});
