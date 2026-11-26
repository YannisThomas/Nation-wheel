// Systèmes « physiques » du monde : économie, population, société, armée.
// Chaque variable est bornée ou converge vers un équilibre : pas d'économie
// infinie ni de population négative, même sur des milliers de ticks.

import { carryingCapacity } from './map';
import { addJournal } from './journal';
import { clamp, randNorm, pick, spin, rand } from './rng';
import { trySecession } from './secession';
import { climateSeason, eraMods, harvestFactor, winterSeverity } from './seasons';
import { GOVERNMENTS, LEADER_TRAITS, type Nation, type Status, type World } from './types';

/** Coût d'un point d'équipement militaire, Md$. */
export const UNIT_COST = 0.5;
export const TECH_MAX = 120;

export const gdpPerCapita = (n: Nation) => (n.gdp * 1e9) / Math.max(1, n.pop);

/** PIB potentiel (Md$) : ce vers quoi l'économie converge. */
export function potentialGdp(n: Nation): number {
  const deposits = Object.values(n.geo.resources).reduce((a, b) => a + b, 0);
  const resourceBonus = 1 + Math.min(0.3, (4 * deposits) / Math.max(1, n.geo.cells) * (0.3 + 0.7 * n.industry / 100));
  const perCapita = 400 * Math.exp(n.tech / 21)
    * (0.55 + 0.45 * n.infrastructure / 100)
    * (0.7 + 0.3 * n.education / 100)
    * (0.5 + 0.5 * n.stability / 100)
    * (0.75 + 0.25 * n.industry / 100)
    * resourceBonus
    * (1 - 0.35 * n.mil.mobilization)
    * (1 - 0.6 * Math.max(0, n.taxRate - 0.3))
    * (1 + n.tradeBonus) * (n.blockaded ? 0.93 : 1) * (n.leader.trait === 'merchant' ? 1.02 : 1);
  return (perCapita * n.pop) / 1e9;
}

export function militaryPower(n: Nation): number {
  const m = n.mil;
  const equipment = m.army + 0.8 * m.airforce + 0.6 * m.navy;
  return (Math.sqrt(m.personnel) / 10 + 5 * equipment)
    * (0.5 + m.tech / 100) * (0.6 + m.experience / 125) * (0.6 + m.logistics / 125)
    * (n.leader.trait === 'warlord' ? 1.05 : 1);
}

export function computeHdi(n: Nation): number {
  const income = clamp(Math.log(Math.max(100, gdpPerCapita(n)) / 100) / Math.log(750), 0.01, 1);
  return Math.cbrt(Math.max(0.01, n.health / 100) * Math.max(0.01, n.education / 100) * income);
}

export function tickNation(world: World, n: Nation): void {
  const gdp0 = n.gdp;
  const m = n.mil;

  // --- Budget ---
  const revenue = ((n.gdp * n.taxRate * (0.6 + 0.4 * n.stability / 100)) / 12) * harvestFactor(world, n);
  const debtRatio = n.debt / Math.max(1e-6, n.gdp);
  const interestRate = Math.min(0.25, 0.02 + Math.max(0, debtRatio - 0.6) * 0.05);
  const interest = (n.debt * interestRate) / 12;
  // Les intérêts passent en premier ; l'État garde au moins 30 % de ses recettes pour fonctionner.
  let spend = Math.max(revenue * 0.3, (revenue - interest) * 0.97);
  n.treasury += revenue - interest - spend;
  // Tribut versé à la puissance tutélaire.
  if (n.overlord >= 0) {
    const lord = world.nations[n.overlord];
    if (!lord.alive) {
      n.overlord = -1; n.colony = false;
      addJournal(world, 'independence', [n.id, lord.id], `${n.name} retrouve son indépendance après la disparition de ${lord.name}.`);
    } else {
      const tribute = spend * (n.colony ? 0.12 : 0.03);
      spend -= tribute;
      lord.treasury += tribute;
    }
  }
  n.revenue = revenue * 12;
  const era = eraMods(world);
  const winter = winterSeverity(world, n);
  n.expenses = (spend + interest) * 12;
  if (n.treasury < 0) { n.debt -= n.treasury; n.treasury = 0; }
  const reserve = revenue * 2;
  if (n.debt > 0 && n.treasury > reserve) {
    const pay = Math.min(n.debt, (n.treasury - reserve) * 0.5);
    n.debt -= pay;
    n.treasury -= pay;
  }
  if (n.debt > 2.5 * n.gdp) {
    n.debt *= 0.35;
    n.gdp *= 0.92;
    n.stability = clamp(n.stability - 20, 0, 100);
    addJournal(world, 'default', [n.id], `${n.name} fait défaut sur sa dette souveraine.`);
  }

  const share = (k: keyof Nation['budget']) => (spend * n.budget[k] * 12) / Math.max(1e-6, n.gdp); // en part du PIB annuel
  const techEff = 0.4 + 0.6 * n.tech / 100;

  // --- Recherche ---
  const research = share('research');
  const dTech = 0.025 * (research * (1 - n.militaryResearchShare) / 0.015) * (0.3 + 0.7 * n.education / 100) * (1 - n.tech / TECH_MAX)
    + 0.004 * Math.max(0, world.techFrontier - n.tech) / 50;
  n.tech = clamp(n.tech + Math.min(0.15, dTech * era.tech * (n.leader.trait === 'scholar' ? 1.1 : 1)), 0, TECH_MAX);
  const milCeiling = Math.max(0, 1 - m.tech / (n.tech + 20));
  m.tech = clamp(m.tech + Math.min(0.15, 0.025 * (research * n.militaryResearchShare / 0.005) * milCeiling) - 0.01, 0, TECH_MAX);

  // --- Capital humain et physique ---
  n.education += (100 * (1 - Math.exp(-share('education') / 0.025)) - n.education) * 0.004;
  const welfare = share('welfare');
  n.health += (25 + 75 * (1 - Math.exp(-welfare / 0.05)) * techEff - n.health) * 0.006;
  n.infrastructure += (100 * share('infrastructure') / 12) * 8 * (1 - n.infrastructure / 100) * techEff * (n.leader.trait === 'builder' ? 1.15 : 1) - n.infrastructure * 0.004;
  n.industry += (100 * share('industry') / 12) * 10 * (1 - n.industry / 100) * techEff - n.industry * 0.004;
  n.education = clamp(n.education, 1, 100);
  n.health = clamp(n.health, 1, 100);
  n.infrastructure = clamp(n.infrastructure, 1, 100);
  n.industry = clamp(n.industry, 1, 100);

  // --- Armée ---
  const milSpend = spend * n.budget.military;
  m.budget = milSpend * 12;
  const martial = n.ideology === 'militarist' || n.government === 'military_junta' ? 1.6 : 1;
  const target = Math.min(n.pop * 0.12, n.pop * (0.003 * martial + 0.06 * m.mobilization));
  m.personnel += (target - m.personnel) * 0.08;
  m.reserves += (n.pop * 0.02 - m.reserves) * 0.02;
  const soldierCost = Math.max(600, 2 * gdpPerCapita(n));
  const equipment = m.army + m.airforce + m.navy;
  const upkeep = ((m.personnel * soldierCost) / 1e9 + equipment * UNIT_COST * 0.06) / 12;
  const surplus = milSpend - upkeep;
  if (surplus >= 0) {
    const points = surplus / (UNIT_COST * (1 + m.tech / 100));
    const navy = n.geo.landlocked ? 0 : m.doctrine === 'naval' ? 0.4 : 0.15;
    const air = (1 - navy) * clamp(n.tech / 200, 0, 0.4);
    m.navy += points * navy;
    m.airforce += points * air;
    m.army += points * (1 - navy - air);
  } else {
    // Sous-financement : le matériel se dégrade.
    const decay = 1 - 0.02 * Math.min(1, -surplus / Math.max(1e-9, upkeep));
    m.army *= decay; m.airforce *= decay; m.navy *= decay;
  }
  m.army *= 0.997; m.airforce *= 0.997; m.navy *= 0.997; // obsolescence
  m.logistics += (clamp(n.infrastructure * 0.7 + m.tech * 0.3, 0, 100) - m.logistics) * 0.02;
  m.experience += (20 - m.experience) * 0.003;
  m.power = militaryPower(n);

  // --- Production ---
  const potential = potentialGdp(n) * era.growth;
  n.gdp = Math.max((n.pop * 100) / 1e9, n.gdp + (potential - n.gdp) * 0.012 + n.gdp * randNorm(world) * 0.002);
  n.gdpGrowth = Math.pow(n.gdp / Math.max(1e-9, gdp0), 12) - 1;

  // --- Population ---
  n.hdi = computeHdi(n);
  const capacity = Math.max(1000, carryingCapacity(n, world.map) * era.fertility * (1 + Math.min(2, gdpPerCapita(n) / 15000)));
  // L'hiver tue davantage là où la santé publique est faible.
  const natural = 0.03 * (1 - n.hdi) + 0.001 - 0.006 * n.hdi * n.hdi + era.population - 0.012 * winter * (1 - n.health / 100);
  const pressure = n.pop / capacity;
  const growth = pressure > 1 ? -0.02 * Math.min(1, pressure - 1) + Math.min(natural, 0)
    : natural > 0 ? natural * (1 - pressure) : natural;
  n.pop = Math.max(1000, n.pop * (1 + growth / 12));
  n.popGrowth = growth;
  n.urbanization += (clamp(10 + 0.5 * n.industry + 0.3 * n.tech, 5, 95) - n.urbanization) * 0.005;

  // --- Société ---
  const stabilityTarget = 50 + 30 * (n.hdi - 0.5) + clamp(n.gdpGrowth * 150, -12, 8)
    - 15 * Math.max(0, debtRatio - 1) - 25 * m.mobilization - 60 * Math.max(0, n.taxRate - 0.35)
    + 8 * clamp(welfare / 0.09 - 1, -1, 1)
    - 0.25 * n.warExhaustion - 40 * Math.min(0.5, n.overextension) - 70 * Math.max(0, n.geo.cells / world.landCells - 0.06)
    + (n.leader.trait === 'reformer' || n.leader.trait === 'populist' ? 3 : 0)
    + era.stability - 3 * winter + (world.config.climateSeasons && climateSeason(world, n.geo.latitude) === 'autumn' ? 1.5 : 0);
  n.warExhaustion = Math.max(0, n.warExhaustion - 0.6);
  n.stability = clamp(n.stability + (stabilityTarget - n.stability) * 0.04 + randNorm(world) * 0.6, 0, 100);
  n.qualityOfLife = 100 * (0.6 * n.hdi + 0.25 * n.stability / 100 + 0.15 * (1 - m.mobilization));

  // --- Politique intérieure ---
  if (n.stability < 15 && rand(world) < 0.015) {
    const old = n.government;
    n.government = pick(world, GOVERNMENTS.filter((g) => g !== old));
    n.wheel.government = '';
    n.leader = { ...n.leader, trait: pick(world, LEADER_TRAITS), since: world.tick, name: n.leader.name.split(' ').reverse().join(' ') };
    n.stability = Math.max(45, clamp(n.stability + 25, 0, 100));
    addJournal(world, 'regime_change', [n.id], `Le régime de ${n.name} s'effondre : ${old} → ${n.government}.`);
    if (rand(world) < 0.6) trySecession(world, n);
  } else if (n.stability < 35 && n.geo.cells / world.landCells > 0.12 && rand(world) < 0.006 * era.unrest) {
    // Surextension impériale : les provinces lointaines se détachent.
    trySecession(world, n);
  } else if (rand(world) < 1 / (12 * 18)) {
    n.leader = { name: n.leader.name.split(' ').reverse().join(' '), trait: pick(world, LEADER_TRAITS), since: world.tick };
    addJournal(world, 'succession', [n.id], `Nouveau dirigeant en ${n.name} (${n.leader.trait}).`);
  }
}

const EVENTS = [
  ['bad_harvest', 3], ['boom', 2], ['epidemic', 1.5], ['discovery', 1.5], ['unrest', 2], ['disaster', 1.5], ['deposit', 1],
] as const;

export function randomEvents(world: World): void {
  for (const n of world.nations) {
    if (!n.alive || rand(world) >= world.config.eventRate) continue;
    // Les saisons pèsent sur les aléas : sécheresses d'été, épidémies d'hiver, tempêtes d'automne.
    const season = world.config.climateSeasons ? climateSeason(world, n.geo.latitude) : null;
    const weight = (kind: string, w: number) => kind === 'bad_harvest' ? w * (season === 'summer' || season === 'autumn' ? 1.8 : season === 'winter' ? 0.2 : 1)
      : kind === 'epidemic' ? w * (season === 'winter' ? 2.2 : 1) * (world.season.era === 'pandemic' ? 3 : 1) : kind === 'disaster' ? w * (season === 'autumn' ? 1.6 : 1) : w;
    switch (spin(world, EVENTS.map(([k, w]) => [k, weight(k, w)] as const))) {
      case 'bad_harvest':
        n.pop *= 0.995; n.stability = clamp(n.stability - 5, 0, 100);
        addJournal(world, 'event', [n.id], `Mauvaises récoltes en ${n.name}.`); break;
      case 'boom':
        n.gdp *= 1.02;
        addJournal(world, 'event', [n.id], `Boom économique en ${n.name}.`); break;
      case 'epidemic': {
        const loss = 0.004 + rand(world) * 0.012 * (1 - n.health / 120);
        n.pop = Math.max(1000, n.pop * (1 - loss)); n.health = clamp(n.health - 3, 1, 100);
        addJournal(world, 'event', [n.id], `Épidémie en ${n.name} (${(loss * 100).toFixed(1)} % de la population).`); break;
      }
      case 'discovery':
        n.tech = clamp(n.tech + 0.5, 0, TECH_MAX);
        addJournal(world, 'event', [n.id], `Percée scientifique en ${n.name}.`); break;
      case 'unrest':
        n.stability = clamp(n.stability - 8, 0, 100);
        addJournal(world, 'event', [n.id], `Troubles sociaux en ${n.name}.`); break;
      case 'disaster':
        n.infrastructure = clamp(n.infrastructure - 3, 1, 100); n.gdp *= 0.99;
        addJournal(world, 'event', [n.id], `Catastrophe naturelle en ${n.name}.`); break;
      case 'deposit': {
        // Découverte d'un gisement : modifie réellement la carte.
        const { map } = world;
        for (let tries = 0; tries < 40; tries++) {
          const i = Math.floor(rand(world) * map.owner.length);
          if (map.owner[i] === n.id && map.resource[i] < 0) {
            map.resource[i] = Math.floor(rand(world) * 8);
            world.geoDirty = true;
            addJournal(world, 'event', [n.id], `Nouveau gisement découvert en ${n.name}.`);
            break;
          }
        }
        break;
      }
    }
  }
}

/** Classement géopolitique, relatif à la moyenne mondiale. */
export function updateStatuses(world: World): void {
  const alive = world.nations.filter((n) => n.alive);
  const meanGdp = alive.reduce((s, n) => s + n.gdp, 0) / Math.max(1, alive.length);
  const meanPower = alive.reduce((s, n) => s + n.mil.power, 0) / Math.max(1, alive.length);
  const score = (n: Nation) => 0.6 * n.gdp / Math.max(1e-9, meanGdp) + 0.4 * n.mil.power / Math.max(1e-9, meanPower);
  const mean = 1;
  for (const n of alive) {
    const r = score(n) / Math.max(1e-9, mean);
    const status: Status = n.geo.cells <= 3 || n.pop < 3e5 ? 'microstate'
      : r >= 6 ? 'superpower' : r >= 3 ? 'great_power' : r >= 1.6 ? 'regional_power' : r >= 0.8 ? 'middle_power' : 'minor_power';
    n.status = status;
  }
}
