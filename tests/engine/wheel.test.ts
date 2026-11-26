import { describe, expect, it } from 'vitest';
import { Director } from '../../src/agents/director';
import { proactiveOptions } from '../../src/agents/options';
import { buildContext } from '../../src/agents/context';
import { preferences, surroundings } from '../../src/agents/profile';
import { execTool } from '../../src/agents/tools';
import { adminCommand } from '../../src/engine/admin';
import { redrawDoctrine } from '../../src/engine/doctrine';
import { DOCTRINES } from '../../src/data/wheels3';
import { potentialGdp } from '../../src/engine/systems';
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
  const pick = (spins: { pool: string; result: string; shown?: string }[], pool: string) => spins.filter((sp) => sp.pool === pool);

  it('anciennes roues : chaque tirage figure sur sa roue et correspond au monde créé', () => {
    const w = createWorld({ nations: 60, seed: 4 });
    const before = exactHash(w);
    const { pools, draws } = wheelDraws(w);
    expect(exactHash(w)).toBe(before);
    expect(draws).toHaveLength(60);
    expect(pools.trait.segments.map(([l]) => l)).toContain(NO_TRAIT);
    expect(pools.start.segments.reduce((a, [, x]) => a + x, 0)).toBe(100);
    const kinds = new Set<string>();
    for (const d of draws) {
      const n = w.nations[d.id];
      // La note militaire est recalculée après le tirage : elle peut sortir de la roue d'origine.
      for (const sp of d.spins) if (sp.pool !== 'rating') expect(pools[sp.pool].segments.map(([l]) => l), `${sp.pool} ${sp.result}`).toContain(sp.result);
      expect(pick(d.spins, 'rating')[0].result).toBe(ratingLabel(n.wheel.militaryRating));
      const start = pick(d.spins, 'start')[0];
      kinds.add(start.result);
      const s = n.wheel.start!;
      // Le statut annoncé est celui que le moteur a réellement appliqué.
      if (s.kind === 'colony' || s.kind === 'protectorate') expect(n.overlord === s.target).toBe(s.applied);
      if (s.kind === 'colony' && s.applied) expect(start.shown).toBe(`Colonie de ${w.nations[s.target].name}`);
      if (!s.applied) expect(start.shown).toMatch(/sans effet/);
    }
    expect(kinds.size).toBeGreaterThan(3);
  });

  it('saison 1 : les roues reprennent les tirages du wiki', () => {
    const w = createWorld({ roster: 'season1', seed: 1 });
    const { pools, draws } = wheelDraws(w);
    expect(draws).toHaveLength(SEASON1.length);
    expect(pick(draws[0].spins, 'government')[0].result).toBe(SEASON1[0].gov);
    expect(pick(draws[0].spins, 'start')[0].shown).toBe('Colonie de Moravia');
    for (const d of draws) for (const sp of d.spins) expect(pools[sp.pool].segments.map(([l]) => l)).toContain(sp.result);
  });
});

describe('saison 3 : les roues de Nation Wheel', () => {
  it('chaque nation tire la suite complète des roues, et le monde créé leur correspond', () => {
    const w = createWorld({ roster: 'season3', nations: 60, seed: 7 });
    const { pools, draws } = wheelDraws(w);
    expect(draws).toHaveLength(w.nations.length);
    const ideologies = new Set<string>();
    const regions = new Set<string>();
    for (const d of draws) {
      const n = w.nations[d.id];
      const titles = d.spins.map((sp) => sp.title);
      for (const t of ['Country Size', 'Population', 'Ideology', 'Region', 'Are you landlocked?', 'GDP', 'Resources', 'HDI', 'Army', 'Secret Services', 'Background', 'Great People']) expect(titles, `${n.name} ${t}`).toContain(t);
      // Tout résultat figure sur la roue montrée à l'écran.
      for (const sp of d.spins) expect((sp.options ?? pools[sp.pool].segments.map(([l]) => l)), `${sp.pool} ${sp.result}`).toContain(sp.result);
      const of = (pool: string) => d.spins.find((sp) => sp.pool === pool)!.result;
      const ideology = of('ideology');
      ideologies.add(ideology);
      regions.add(of('region'));
      expect(of('region')).toBe(n.wheel.region);
      expect(of('landlocked')).toBe(n.geo.landlocked ? 'Yes' : 'No');
      expect(n.pop).toBeGreaterThanOrEqual(9e4);
      if (ideology === 'Colony') {
        expect(titles).toContain('Colonial Authority & Stability');
        if (titles.includes('Which Empire ?')) { expect(n.overlord).toBeGreaterThanOrEqual(0); expect(n.colony).toBe(true); }
      } else {
        expect(n.wheel.government).toBe(d.spins.find((sp) => sp.pool === `doctrine:${ideology}`)!.result);
        expect(n.overlord).toBe(-1);
      }
      if (of('army') === 'No Army') { expect(titles).not.toContain('Active-duty personnel'); expect(n.mil.army + n.mil.airforce + n.mil.navy).toBe(0); }
      expect(n.wheel.s3!.background).toBe(of('background'));
      expect(n.wheel.s3!.secret).toBeGreaterThanOrEqual(1);
      expect(n.wheel.s3!.secret).toBeLessThanOrEqual(10);
      for (const v of [n.gdp, n.tech, n.stability, n.hdi, n.mil.power, n.pop]) expect(Number.isFinite(v)).toBe(true);
    }
    expect(ideologies.size).toBeGreaterThan(5);
    expect(regions.size).toBeGreaterThan(5);
    // PIB tiré respecté quand le moteur peut l'atteindre.
    const close = draws.filter((d) => { const n = w.nations[d.id]; const gdp = parseFloat(d.spins.find((sp) => sp.pool === 'gdp')!.result); return n.gdp / gdp > 0.8 && n.gdp / gdp < 1.2; }).length;
    expect(close).toBeGreaterThan(draws.length * 0.6);
    // Une classe d'armée plus haute donne une armée plus forte.
    const power = (label: string) => w.nations.filter((n) => n.wheel.spins!.some((sp) => sp.pool === 'army' && sp.result === label)).map((n) => n.mil.power);
    const strong = [...power('Regional Military Power'), ...power('Global Military Power'), ...power('Superpower Military')];
    const weak = [...power('Local Militia'), ...power('Small Defense Force'), ...power('Civil Guard')];
    if (strong.length && weak.length) expect(Math.min(...strong)).toBeGreaterThan(Math.max(...weak));
  });

  it('est déterministe et tient 600 ticks avec agents sans valeur absurde', () => {
    const a = createWorld({ roster: 'season3', nations: 40, seed: 3 });
    const b = createWorld({ roster: 'season3', nations: 40, seed: 3 });
    expect(exactHash(a)).toBe(exactHash(b));
    const director = new Director();
    for (let i = 0; i < 600; i++) { const { actions } = director.decideSync(a); director.attachResults(step(a, actions)); }
    const alive = a.nations.filter((n) => n.alive);
    expect(alive.length).toBeGreaterThan(10);
    for (const n of alive) {
      for (const v of [n.pop, n.gdp, n.stability, n.tech, n.treasury, n.debt, n.mil.power, n.mil.personnel]) expect(Number.isFinite(v), n.name).toBe(true);
      expect(n.pop).toBeGreaterThan(0);
      expect(n.stability).toBeGreaterThanOrEqual(0);
      expect(n.stability).toBeLessThanOrEqual(100);
    }
    const land = alive.reduce((s2, n) => s2 + n.geo.cells, 0);
    expect(Math.max(...alive.map((n) => n.geo.cells)) / land).toBeLessThan(0.75);
  });
});

describe('saison 3 : le tirage pèse sur le moteur et sur le LLM', () => {
  const world = () => createWorld({ roster: 'season3', nations: 40, seed: 11 });

  it('le contexte donné au LLM porte le tirage de la nation', () => {
    const w = world();
    const n = w.nations.find((x) => x.wheel.s3!.doctrine)!;
    const around = surroundings(w, n);
    const ctx = buildContext(w, n, { prefs: preferences(w, n, around), around }, []);
    const s3 = n.wheel.s3!;
    for (const text of [s3.ideology, s3.doctrine, s3.region, s3.impact, s3.secretName.replace(/ \(\d+\)$/, ''), `niveau ${s3.secret}/10`, s3.background, s3.great]) expect(ctx).toContain(text);
    // Les mondes des autres modes n'ont pas ces lignes.
    const old = createWorld({ nations: 10, seed: 2, width: 80, height: 45 });
    const o = old.nations[0];
    expect(buildContext(old, o, { prefs: preferences(old, o), around: surroundings(old, o) }, [])).not.toContain('Idéologie :');
  });

  it('idéologie, doctrine et services secrets déplacent la personnalité', () => {
    const w = world();
    const n = w.nations[0];
    const s3 = n.wheel.s3!;
    Object.assign(s3, { ideology: 'Democracy', doctrine: 'The Jury State', impact: '', impactSign: 0, background: '', great: '', secret: 5 });
    const calm = preferences(w, n);
    Object.assign(s3, { ideology: 'Imperialism', doctrine: 'Conquest Empire' });
    const empire = preferences(w, n);
    expect(empire.expansion).toBeGreaterThan(calm.expansion);
    expect(empire.offensive).toBeGreaterThan(calm.offensive);
    s3.secret = 10;
    expect(preferences(w, n).risk).toBeGreaterThan(empire.risk);
    Object.assign(s3, { impact: 'Naval Weakness', impactSign: -1 });
    const weak = preferences(w, n).navy;
    Object.assign(s3, { impact: 'Naval Supremacy', impactSign: 1 });
    expect(preferences(w, n).navy).toBeGreaterThanOrEqual(weak);
  });

  it('un changement de régime retire une doctrine cohérente', () => {
    const w = world();
    const n = w.nations.find((x) => x.overlord < 0)!;
    expect(adminCommand(w, { op: 'edit_nation', nation: n.id, patch: { government: 'theocracy' } })).toBeNull();
    expect(n.wheel.s3!.ideology).toBe('Theocracy');
    expect(DOCTRINES.Theocracy).toContain(n.wheel.s3!.doctrine);
    expect(n.wheel.government).toBe(n.wheel.s3!.doctrine);
    n.government = 'federation';
    redrawDoctrine(w, n);
    expect(n.wheel.s3!.ideology).toBe('Democracy');
    expect(n.wheel.s3!.doctrine).toMatch(/Federal|Decentralized|Provincial|Coalition/);
    // Sans tirage de saison 3, rien ne bouge et aucun nombre aléatoire n'est consommé.
    const old = createWorld({ nations: 10, seed: 2, width: 80, height: 45 });
    const before = exactHash(old);
    redrawDoctrine(old, old.nations[0]);
    expect(exactHash(old)).toBe(before);
  });

  it('les services secrets d\'autrui ne se voient qu\'avec des services au moins aussi forts', () => {
    const w = world();
    const [a, b] = w.nations;
    a.wheel.s3!.secret = 3; b.wheel.s3!.secret = 8;
    expect(JSON.parse(execTool(w, a, 'get_nation', { name: b.name })).services_secrets).toMatch(/inconnus/);
    expect(JSON.parse(execTool(w, b, 'get_nation', { name: a.name })).services_secrets).toBe(a.wheel.s3!.secretName);
    expect(JSON.parse(execTool(w, a, 'get_nation', { name: b.name })).ideologie).toBe(b.wheel.s3!.ideology);
  });

  it('les matières premières tirées comptent dans la production', () => {
    const w = world();
    const n = w.nations[0];
    n.wheel.s3!.materials = 0;
    const low = potentialGdp(n);
    n.wheel.s3!.materials = 4;
    expect(potentialGdp(n)).toBeGreaterThan(low);
  });
});
