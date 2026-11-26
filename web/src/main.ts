import { GOAL_FR, GOV_FR, IDEO_FR, PREF_FR, TRAIT_FR } from '../../src/agents/profile';
import { TAG_FR } from '../../src/engine/wheel';
import type { DecisionRecord } from '../../src/agents/director';
import type { InitMsg, NationDetail, NationInfo, StateMsg } from '../../src/host/simhost';
import type { JournalEntry } from '../../src/engine/types';
import { lineChart } from './charts';
import { connect, type Client } from './client';
import { DIV, MapView, nationColor, SEQ, type MapMode } from './mapview';

// ---------- Utilitaires ----------
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const h = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const big = (x: number) => (x >= 1e9 ? `${(x / 1e9).toFixed(2)} Md` : x >= 1e6 ? `${(x / 1e6).toFixed(1)} M` : x >= 1e3 ? `${Math.round(x / 1e3)} k` : `${Math.round(x)}`);
const money = (x: number) => (x >= 1000 ? `${Math.round(x).toLocaleString('fr-FR')} Md$` : x >= 10 ? `${x.toFixed(0)} Md$` : `${x.toFixed(2)} Md$`);
const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)} %`;
const STATUS_FR = ['Micro-État', 'Puissance mineure', 'Puissance moyenne', 'Puissance régionale', 'Grande puissance', 'Superpuissance'];
const STATUS_KEY: Record<string, string> = { microstate: STATUS_FR[0], minor_power: STATUS_FR[1], middle_power: STATUS_FR[2], regional_power: STATUS_FR[3], great_power: STATUS_FR[4], superpower: STATUS_FR[5] };
const RES_FR: Record<string, string> = { oil: 'Pétrole', gas: 'Gaz', coal: 'Charbon', iron: 'Fer', copper: 'Cuivre', gold: 'Or', rare_earths: 'Terres rares', uranium: 'Uranium' };
const TERRAIN_FR: Record<string, string> = { plains: 'Plaines', forest: 'Forêts', hills: 'Collines', mountain: 'Montagnes', desert: 'Déserts', tundra: 'Toundra' };
const BUDGET_FR: Record<string, string> = { military: 'Armée', research: 'Recherche', education: 'Éducation', infrastructure: 'Infrastructures', welfare: 'Social et santé', industry: 'Industrie' };
const DOCTRINE_FR: Record<string, string> = { defensive: 'défensive', balanced: 'équilibrée', offensive: 'offensive', naval: 'navale', guerrilla: 'guérilla' };
const TIER_FR: Record<string, string> = { behavior: 'moteur comportemental', fast: 'modèle rapide', national: 'modèle national', strategic: 'modèle stratégique' };
const SOURCE_FR: Record<string, string> = { behavior: 'Moteur comportemental', llm: 'LLM', cache: 'Cache', fallback: 'Repli (LLM écarté)' };
const MAJOR = ['war_declared', 'peace', 'annexed', 'secession', 'betrayal', 'capital_fall'];
const KIND_GROUPS: Record<string, string[] | null> = {
  Tout: null,
  Guerres: ['war_declared', 'war_joined', 'peace', 'annexed', 'capital_fall', 'landing', 'secession'],
  Diplomatie: ['treaty', 'treaty_broken', 'betrayal', 'sanction', 'sanction_lifted', 'threat', 'aid', 'claim', 'refusal'],
  Politique: ['regime_change', 'succession', 'default', 'event', 'colonized'],
  Admin: ['admin'],
};

// ---------- État de l'interface ----------
let client: Client;
let map: MapView;
let st: StateMsg | null = null;
let init: InitMsg | null = null;
const infos: NationInfo[] = [];
const journal: JournalEntry[] = [];
const ui = {
  panel: null as string | null, sheetTab: 'apercu', sheetSize: 'half' as 'peek' | 'half' | 'full',
  sort: 'gdp', journalFilter: 'Tout', admin: false, paint: false, adminOther: -1,
  decision: null as (DecisionRecord & { id: number }) | null, lastPanelRender: 0, shown: 60,
  history: null as null | { initialOwner: number[]; snapshots: { tick: number; diff: number[] }[]; startYear: number }, historyIndex: -1,
};
const name = (id: number) => h(infos[id]?.name ?? '?');
const link = (id: number) => `<button class="link" data-act="select" data-id="${id}"><i class="dot" style="background:${nationColor(id)}"></i>${name(id)}</button>`;
const row = (id: number) => st!.rows[id];
const yearOf = (tick: number) => (init?.config.startYear ?? 0) + Math.floor(tick / 12);
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const dateOf = (tick: number) => `${MONTHS[tick % 12]} ${yearOf(tick)}`;

function toast(text: string, kind = ''): void {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = text;
  box.append(el);
  while (box.children.length > 3) box.firstElementChild!.remove();
  setTimeout(() => el.remove(), 4500);
}
const run = async (p: Promise<unknown>, ok?: string) => { try { await p; if (ok) toast(ok); } catch (e) { toast(e instanceof Error ? e.message : String(e), 'bad'); } };

// ---------- Composants ----------
function flag(f: NationInfo['flag'], w = 42): string {
  const [a, b, c] = f.colors.map(h);
  const body: Record<string, string> = {
    horizontal: `<rect width="30" height="7" fill="${a}"/><rect y="7" width="30" height="6" fill="${b}"/><rect y="13" width="30" height="7" fill="${c}"/>`,
    vertical: `<rect width="10" height="20" fill="${a}"/><rect x="10" width="10" height="20" fill="${b}"/><rect x="20" width="10" height="20" fill="${c}"/>`,
    cross: `<rect width="30" height="20" fill="${a}"/><rect x="9" width="5" height="20" fill="${b}"/><rect y="7.5" width="30" height="5" fill="${b}"/>`,
    canton: `<rect width="30" height="20" fill="${a}"/><rect width="13" height="10" fill="${b}"/><rect y="15" width="30" height="5" fill="${c}"/>`,
    disc: `<rect width="30" height="20" fill="${a}"/><circle cx="15" cy="10" r="5.5" fill="${b}"/>`,
    diagonal: `<rect width="30" height="20" fill="${a}"/><path d="M0 20 L30 0 L30 20Z" fill="${b}"/><path d="M0 20 L30 0" stroke="${c}" stroke-width="2.5"/>`,
  };
  return `<svg class="flag" width="${w}" height="${(w * 2) / 3}" viewBox="0 0 30 20" role="img" aria-label="Drapeau">${body[f.pattern]}</svg>`;
}
const stat = (label: string, value: string, hint = '') => `<div class="stat"><span>${h(label)}</span><b>${value}</b>${hint ? `<small>${h(hint)}</small>` : ''}</div>`;
const meter = (label: string, v: number, max = 100, text = `${Math.round(v)}`) => `<div class="meter"><span>${h(label)}</span><div class="track"><i style="width:${Math.max(0, Math.min(100, (v / max) * 100))}%"></i></div><b>${text}</b></div>`;
const chip = (text: string, cls = '') => `<span class="chip ${cls}">${h(text)}</span>`;
const section = (title: string, body: string) => `<h3>${h(title)}</h3>${body}`;
const empty = (text: string) => `<p class="empty">${h(text)}</p>`;

function journalList(list: JournalEntry[], max = 80): string {
  if (!list.length) return empty('Aucun événement pour l\'instant.');
  return `<ul class="journal">${list.slice(0, max).map((e) => `<li class="${MAJOR.includes(e.type) ? 'major' : ''} ${e.admin ? 'admin' : ''}" ${e.nations.length ? `data-act="select" data-id="${e.nations[0]}"` : ''}><time>${dateOf(e.tick)}</time><span>${h(e.text)}</span></li>`).join('')}</ul>`;
}

function decisionList(list: (DecisionRecord & { id: number })[], withNation = true): string {
  if (!list.length) return empty('Aucune décision enregistrée pour l\'instant.');
  return `<ul class="decisions">${list.map((d) => `<li data-act="decision" data-id="${d.id}"><div><time>${dateOf(d.tick)}</time>${withNation ? ` · <b>${name(d.nation)}</b>` : ''} ${chip(SOURCE_FR[d.source], d.source)}</div><span>${h(d.label)}</span>${d.validation && d.validation !== 'ok' ? `<small class="bad">${h(d.validation)}</small>` : ''}</li>`).join('')}</ul>`;
}

function decisionDetail(d: DecisionRecord & { id: number }): string {
  const effects = d.effects ? Object.entries(d.effects).filter(([, v]) => v).map(([k, v]) => `${h(k)} ${v > 0 ? '+' : ''}${Math.round(v * 100) / 100}`).join(' · ') : '';
  return `<button class="back" data-act="decision-back">← Retour</button>
    <h3>${name(d.nation)} · ${dateOf(d.tick)}</h3>
    <ol class="pipeline">
      <li><b>Importance</b> ${Math.round(d.importance * 100)} % → ${h(TIER_FR[d.tier])}</li>
      <li><b>Décidé par</b> ${h(SOURCE_FR[d.source])}${d.model ? ` (${h(d.model)})` : ''}${d.note ? `<br><small>${h(d.note)}</small>` : ''}</li>
      ${d.tools?.length ? `<li><b>Outils consultés</b> ${d.tools.map(h).join(', ')}</li>` : ''}
      <li><b>Action proposée</b> ${h(d.label)}</li>
      <li><b>Facteurs principaux</b><ul>${d.keyFactors.map((f) => `<li>${h(f)}</li>`).join('')}</ul></li>
      <li><b>Validation du moteur</b> <span class="${d.validation === 'ok' ? 'good' : 'bad'}">${d.validation === 'ok' ? '✓ acceptée' : `✗ ${h(d.validation ?? 'en attente')}`}</span></li>
      ${effects ? `<li><b>Conséquences calculées</b> ${effects}</li>` : ''}
    </ol>
    <details><summary>Options présentées (${d.options.length})</summary><ol>${d.options.map((o) => `<li>${h(o)}</li>`).join('')}</ol></details>
    ${d.context ? `<details><summary>Contexte fourni au LLM</summary><pre>${h(d.context)}</pre></details>` : ''}`;
}

// ---------- Fiche nation (panneau inférieur) ----------
function sheetBody(d: NationDetail): string {
  const info = infos[d.id];
  const world = st!.world;
  const gdppc = (d.gdp * 1e9) / Math.max(1, d.pop);
  switch (ui.sheetTab) {
    case 'economie': return `
      <div class="grid">${stat('PIB', money(d.gdp), `${(d.gdpGrowth * 100).toFixed(1)} %/an`)}${stat('PIB / habitant', `${big(gdppc)} $`)}${stat('Trésor', money(d.treasury))}${stat('Dette', pct(d.debt / Math.max(1e-6, d.gdp)), 'du PIB')}${stat('Impôts', pct(d.taxRate))}${stat('Recettes', money(d.revenue), 'par an')}${stat('Exportations', money(d.exports))}${stat('Importations', money(d.imports))}</div>
      ${d.blockaded ? '<p class="alert">Ports sous blocus : le commerce est étouffé.</p>' : ''}
      ${section('PIB', '<canvas class="chart" data-series="1"></canvas>')}
      ${section('Budget (part des dépenses)', Object.entries(d.budget).map(([k, v]) => meter(BUDGET_FR[k], v * 100, 60, pct(v))).join(''))}
      ${section('Niveaux', meter('Technologie', d.tech, 120) + meter('Industrie', d.industry) + meter('Infrastructures', d.infrastructure) + meter('Éducation', d.education) + meter('Santé', d.health))}
      ${section('Commerce', `<p>Effet net du commerce et des sanctions sur l'économie : <b>${d.tradeBonus >= 0 ? '+' : ''}${(d.tradeBonus * 100).toFixed(1)} %</b></p>`)}
      ${section('Ressources', `<div class="chips">${Object.entries(d.geo.resources).filter(([, v]) => v).map(([k, v]) => chip(`${RES_FR[k]} × ${v}`)).join('') || 'Aucun gisement connu'}</div>`)}`;
    case 'armee': return `
      <div class="grid">${stat('Soldats', big(d.mil.personnel))}${stat('Réserves', big(d.mil.reserves))}${stat('Mobilisation', pct(d.mil.mobilization))}${stat('Puissance', big(d.mil.power))}${stat('Budget', money(d.mil.budget), 'par an')}${stat('Doctrine', DOCTRINE_FR[d.mil.doctrine])}</div>
      ${section('Forces', meter('Armée de terre', d.mil.army, Math.max(1, d.mil.army + d.mil.airforce + d.mil.navy), big(d.mil.army)) + meter('Aviation', d.mil.airforce, Math.max(1, d.mil.army + d.mil.airforce + d.mil.navy), big(d.mil.airforce)) + meter('Marine', d.mil.navy, Math.max(1, d.mil.army + d.mil.airforce + d.mil.navy), big(d.mil.navy)))}
      ${section('Qualité', meter('Technologie militaire', d.mil.tech, 120) + meter('Expérience', d.mil.experience) + meter('Logistique', d.mil.logistics) + meter('Usure de guerre', d.warExhaustion, 150))}
      ${section('Guerres', d.wars.length ? d.wars.map((w) => `<div class="card war"><b>${h(w.name)}</b><span>${w.side === 'attackers' ? 'Attaquant' : 'Défenseur'}, posture ${w.stance === 'offensive' ? 'offensive' : 'défensive'}</span><span>${w.edge > 15 ? 'Avantage' : w.edge < -15 ? 'En difficulté' : 'Front indécis'} · ${big(w.casualties)} pertes</span></div>`).join('') : empty('En paix.'))}`;
    case 'diplomatie': return `
      <div class="grid">${stat('Menace perçue', `${d.threat} %`, d.mainThreat >= 0 ? infos[d.mainThreat]?.name : '')}${stat('Réputation d\'agresseur', `${Math.round(d.infamy)}`, 'sur 100')}${stat('Bloc', d.bloc >= 0 ? name(d.bloc) : '—')}${stat('Protecteur', d.sphereOf >= 0 ? name(d.sphereOf) : '—')}</div>
      ${d.proposals.length ? section('Propositions reçues', d.proposals.map((p) => `<p>${link(p.from)} : ${h(p.kind)}</p>`).join('')) : ''}
      ${section('Relations', d.relations.length ? `<ul class="relations">${d.relations.map((r) => `<li>${link(r.id)}<span class="badges">${r.atWar ? chip('Guerre', 'bad') : ''}${r.pact ? chip('Pacte de défense', 'good') : ''}${r.nap ? chip('Non-agression') : ''}${r.trade ? chip('Commerce') : ''}${r.sanctioning ? chip('Nous sanctionnons', 'warn') : ''}${r.sanctioned ? chip('Nous sanctionne', 'warn') : ''}${r.claiming ? chip('Nous revendiquons', 'warn') : ''}${r.claimed ? chip('Revendique chez nous', 'warn') : ''}${r.truce ? chip('Trêve') : ''}${r.feeling <= -15 ? chip('Rancune', 'bad') : r.feeling >= 15 ? chip('Gratitude', 'good') : ''}</span><b class="opinion" style="color:${r.opinion < -15 ? 'var(--bad)' : r.opinion > 15 ? 'var(--series)' : 'var(--text-2)'}">${r.opinion > 0 ? '+' : ''}${r.opinion}</b></li>`).join('')}</ul>` : empty('Aucune relation établie.'))}`;
    case 'esprit': return `
      ${section('Personnalité', `<p class="hint">Calculée à partir du régime, de la géographie, de l'économie, du dirigeant et du vécu. Elle évolue.</p>${Object.entries(d.prefs).sort((a, b) => b[1] - a[1]).map(([k, v]) => meter(PREF_FR[k], v)).join('')}`)}
      ${section('Objectifs', Object.entries(d.goals).sort((a, b) => b[1] - a[1]).map(([k, v]) => meter(GOAL_FR[k as keyof typeof GOAL_FR], v)).join(''))}
      ${section('Mémoire', d.memory.recalled.length ? `<ul class="plain">${d.memory.recalled.map((m) => `<li>${h(m)}</li>`).join('')}</ul>` : empty('Rien de marquant encore.'))}
      ${d.memory.historical.length ? section('Histoire', `<ul class="plain">${d.memory.historical.map((m) => `<li>${h(m)}</li>`).join('')}</ul>`) : ''}`;
    case 'decisions': return '<div id="nation-decisions"><p class="empty">Chargement…</p></div>';
    default: return `
      <div class="chips">${d.background.map((t) => chip(t)).join('')}</div>
      ${d.overlord >= 0 ? `<p class="alert">${d.colony ? 'Colonie' : 'Protectorat'} de ${link(d.overlord)} : verse un tribut et ne peut pas déclarer la guerre.</p>` : ''}
      ${d.wars.length ? `<p class="alert">⚔ En guerre : ${d.wars.map((w) => h(w.name)).join(', ')}</p>` : ''}
      <div class="grid">${stat('Population', big(d.pop), `${(d.popGrowth * 100).toFixed(1)} %/an`)}${stat('PIB', money(d.gdp), `${(d.gdpGrowth * 100).toFixed(1)} %/an`)}${stat('PIB / habitant', `${big(gdppc)} $`)}${stat('Stabilité', `${Math.round(d.stability)}`, 'sur 100')}${stat('IDH', d.hdi.toFixed(2))}${stat('Technologie', `${Math.round(d.tech)}`, 'sur 120')}${stat('Superficie', `${big(d.geo.areaKm2)} km²`, pct(d.geo.cells / Math.max(1, st!.rows.reduce((s, r) => s + r[5], 0)), 1) + ' des terres')}${stat('Part du PIB mondial', pct(d.gdp / Math.max(1e-6, world.gdp), 1))}${stat('Urbanisation', pct(d.urbanization / 100))}${stat('Qualité de vie', `${Math.round(d.qualityOfLife)}`, 'sur 100')}</div>
      ${section('Tirage de la roue', `<div class="grid">${stat('Régime', h(d.wheel.government || GOV_FR[d.government]))}${stat('Économie', h(d.wheel.economy || '—'))}${stat('Classe militaire', h(d.wheel.militaryClass), `${d.wheel.militaryRating} / 11`)}${stat('Traits', d.wheel.tags.length ? d.wheel.tags.map((t) => h(TAG_FR[t] ?? t)).join(', ') : '—')}</div>`)}
      ${section('Population', '<canvas class="chart" data-series="0"></canvas>')}
      ${section('Identité', `<p>Capitale <b>${h(info.capitalName)}</b> · culture ${h(d.culture)} · langue ${h(d.language)}<br>Dirigeant <b>${h(d.leader.name)}</b> (${h(TRAIT_FR[d.leader.trait])}), au pouvoir depuis ${yearOf(d.leader.since)}<br>Fondée en ${yearOf(d.foundedTick)}</p>`)}
      ${section('Géographie', `<p>${d.geo.landlocked ? 'Sans accès à la mer' : `${big(d.geo.coastlineKm)} km de côtes`} · ${Object.keys(d.geo.neighbors).length} voisin(s) · ${d.geo.parts > 1 ? `${d.geo.parts} territoires séparés` : 'territoire d\'un seul tenant'} · position stratégique ${d.geo.strategic}/100</p><div class="chips">${Object.entries(d.geo.terrain).filter(([k, v]) => k !== 'ocean' && v > 0.04).sort((a, b) => b[1] - a[1]).map(([k, v]) => chip(`${TERRAIN_FR[k]} ${pct(v)}`)).join('')}</div>`)}`;
  }
}

async function renderSheet(): Promise<void> {
  const el = $('#sheet');
  const d = st?.selected;
  if (!d) { el.hidden = true; return; }
  const info = infos[d.id];
  el.hidden = false;
  el.dataset.size = ui.sheetSize;
  $('#sheet-head').innerHTML = `${flag(info.flag)}<div><b>${h(info.name)}${d.alive ? '' : ' (disparue)'}</b><small>${h(STATUS_KEY[d.status])} · ${h(d.wheel.government || GOV_FR[d.government])}${d.wheel.government ? '' : ` ${h(IDEO_FR[d.ideology])}`}</small></div><button data-act="close-sheet" aria-label="Fermer">✕</button>`;
  $('#sheet-tabs').innerHTML = [['apercu', 'Aperçu'], ['economie', 'Économie'], ['armee', 'Armée'], ['diplomatie', 'Diplomatie'], ['esprit', 'Esprit'], ['decisions', 'Décisions']].map(([k, l]) => `<button data-act="tab" data-id="${k}" class="${ui.sheetTab === k ? 'on' : ''}">${l}</button>`).join('');
  const body = $('#sheet-body');
  if (ui.decision && ui.sheetTab === 'decisions') { body.innerHTML = decisionDetail(ui.decision); return; }
  body.innerHTML = sheetBody(d);
  const chart = body.querySelector<HTMLCanvasElement>('canvas.chart');
  if (chart) {
    const idx = Number(chart.dataset.series);
    const series = await client.cmd<{ tick: number; v: number[] }[]>({ type: 'series', nation: d.id });
    if (chart.isConnected) lineChart(chart, series.map((s) => ({ x: yearOf(s.tick), y: s.v[idx] })), idx ? money : big, (x) => `${Math.round(x)}`);
  }
  if (ui.sheetTab === 'decisions') {
    const list = await client.cmd<(DecisionRecord & { id: number })[]>({ type: 'decisions', nation: d.id, limit: 40 });
    const box = document.getElementById('nation-decisions');
    if (box) box.innerHTML = decisionList(list, false);
  }
}

// ---------- Sections plein écran ----------
const SORTS: Record<string, [string, (r: number[]) => number, (r: number[]) => string]> = {
  gdp: ['PIB', (r) => r[3], (r) => money(r[3])], pop: ['Population', (r) => r[2], (r) => big(r[2])], power: ['Armée', (r) => r[6], (r) => big(r[6])],
  land: ['Territoire', (r) => r[5], (r) => `${r[5]} cases`], hdi: ['IDH', (r) => r[11], (r) => r[11].toFixed(2)], stab: ['Stabilité', (r) => r[4], (r) => `${r[4]}`],
  gdppc: ['PIB/hab.', (r) => (r[3] * 1e9) / Math.max(1, r[2]), (r) => `${big((r[3] * 1e9) / Math.max(1, r[2]))} $`], tech: ['Technologie', (r) => r[10], (r) => `${r[10]}`],
};
function ranking(keys: string[]): string {
  const [, get, fmt] = SORTS[ui.sort] ?? SORTS[keys[0]];
  const alive = st!.rows.filter((r) => r[1]).sort((a, b) => get(b) - get(a));
  return `<div class="tabs">${keys.map((k) => `<button data-act="sort" data-id="${k}" class="${ui.sort === k ? 'on' : ''}">${SORTS[k][0]}</button>`).join('')}</div>
    <ol class="ranking">${alive.slice(0, ui.shown).map((r, i) => `<li data-act="select" data-id="${r[0]}"><i>${i + 1}</i>${flag(infos[r[0]].flag, 30)}<span><b>${name(r[0])}</b><small>${STATUS_FR[r[7]]}${r[9] ? ' · en guerre' : ''}</small></span><em>${fmt(r)}</em></li>`).join('')}</ol>
    ${alive.length > ui.shown ? '<button class="wide" data-act="more">Afficher plus</button>' : ''}`;
}

async function panelBody(): Promise<string> {
  const s = st!;
  switch (ui.panel) {
    case 'nations': if (!['gdp', 'pop', 'land', 'hdi', 'stab'].includes(ui.sort)) ui.sort = 'gdp'; return ranking(['gdp', 'pop', 'land', 'hdi', 'stab']);
    case 'economie': if (!['gdp', 'gdppc', 'tech'].includes(ui.sort)) ui.sort = 'gdp'; return `<div class="grid">${stat('PIB mondial', money(s.world.gdp))}${stat('Population', big(s.world.pop))}${stat('PIB / habitant', `${big((s.world.gdp * 1e9) / Math.max(1, s.world.pop))} $`)}${stat('Accords commerciaux', `${s.world.trades}`)}</div>${section('PIB mondial', '<canvas class="chart" data-world="1"></canvas>')}${section('Population mondiale', '<canvas class="chart" data-world="0"></canvas>')}${section('Classement', ranking(['gdp', 'gdppc', 'tech']))}`;
    case 'militaire': ui.sort = 'power'; return `<div class="grid">${stat('Guerres en cours', `${s.wars.length}`)}${stat('Guerres terminées', `${s.world.warsEnded}`)}${stat('Pactes de défense', `${s.world.pacts}`)}${stat('Nations', `${s.world.alive}`)}</div>${section('Guerres en cours', warsHtml())}${section('Nombre de guerres dans le temps', '<canvas class="chart" data-world="3"></canvas>')}${section('Puissances militaires', ranking(['power']))}`;
    case 'diplomatie': {
      const dip = await client.cmd<{ pacts: number[][]; sanctions: number[][]; proposals: { from: number; to: number; kind: string }[] }>({ type: 'diplomacy' });
      const blocs = new Map<number, number[]>();
      for (const r of s.rows) if (r[1] && r[8] >= 0) blocs.set(r[8], [...(blocs.get(r[8]) ?? []), r[0]]);
      return `${section('Guerres en cours', warsHtml())}
        ${section('Blocs d\'alliances', blocs.size ? [...blocs.entries()].sort((a, b) => b[1].length - a[1].length).map(([leader, members]) => `<div class="card"><b>Bloc mené par ${name(leader)}</b><div class="links">${members.map(link).join('')}</div></div>`).join('') : empty('Aucun bloc : pas encore de pacte de défense.'))}
        ${section('Sanctions', dip.sanctions.length ? dip.sanctions.map(([a, b]) => `<p>${link(a)} sanctionne ${link(b)}</p>`).join('') : empty('Aucune sanction en vigueur.'))}
        ${section('Négociations en cours', dip.proposals.length ? dip.proposals.map((p) => `<p>${link(p.from)} → ${link(p.to)} : ${h(p.kind)}</p>`).join('') : empty('Aucune proposition en attente.'))}`;
    }
    case 'evenements': {
      const kinds = KIND_GROUPS[ui.journalFilter];
      const list = [...journal].reverse().filter((e) => !kinds || kinds.includes(e.type));
      return `<div class="tabs">${Object.keys(KIND_GROUPS).map((k) => `<button data-act="jfilter" data-id="${k}" class="${ui.journalFilter === k ? 'on' : ''}">${k}</button>`).join('')}</div>${journalList(list, 150)}`;
    }
    case 'chronologie': {
      ui.history ??= await client.cmd({ type: 'history' });
      const hist = ui.history!;
      const n = hist.snapshots.length;
      if (ui.historyIndex > n) ui.historyIndex = n;
      const i = ui.historyIndex < 0 ? n : ui.historyIndex;
      const tick = i === 0 ? 0 : i >= n ? s.tick : hist.snapshots[i - 1].tick;
      const year = yearOf(tick);
      const events = journal.filter((e) => MAJOR.includes(e.type) && Math.abs(yearOf(e.tick) - year) <= 2).reverse();
      return `<p class="hint">Faites glisser pour revoir la carte à une autre époque. La carte derrière ce panneau change.</p>
        <div class="timeline"><input type="range" min="0" max="${n}" value="${i}" data-act="history" aria-label="Époque"><b>${i >= n ? `Aujourd'hui (${year})` : year}</b></div>
        <button class="wide" data-act="peek-map">Voir la carte</button>
        ${section(`Événements marquants autour de ${year}`, journalList(events, 40))}`;
    }
    case 'dev': {
      if (ui.decision) return decisionDetail(ui.decision);
      const list = await client.cmd<(DecisionRecord & { id: number })[]>({ type: 'decisions', limit: 80 });
      const l = s.llm;
      const total = l.llm + l.cache + l.fallback + l.behavior || 1;
      return `<p class="hint">Chaque décision : contexte → modèle → action proposée → validation du moteur → conséquences.</p>
        <div class="grid">${stat('LLM', `${l.llm}`, pct(l.llm / total))}${stat('Cache', `${l.cache}`, pct(l.cache / total))}${stat('Repli', `${l.fallback}`, pct(l.fallback / total))}${stat('Comportemental', `${l.behavior}`, pct(l.behavior / total))}</div>${decisionList(list)}`;
    }
    case 'admin': return adminHtml();
    case 'parametres': return settingsHtml();
    case 'plus': return `<div class="menu">${[['economie', '📈', 'Économie'], ['militaire', '🛡', 'Militaire'], ['chronologie', '🕰', 'Chronologie'], ['dev', '🧠', 'Décisions (développeur)'], ['admin', '🛠', 'Administrateur'], ['parametres', '⚙', 'Paramètres']].map(([k, i, l]) => `<button data-act="panel" data-id="${k}"><span>${i}</span>${l}</button>`).join('')}</div>`;
    default: return '';
  }
}

function warsHtml(): string {
  if (!st!.wars.length) return empty('Le monde est en paix.');
  return st!.wars.map((w) => `<div class="card war"><b>${h(w.name)}</b><span>Depuis ${dateOf(w.start)} · ${big(w.casualties)} pertes</span><div class="sides"><div>${w.attackers.map(link).join('')}</div><i>contre</i><div>${w.defenders.map(link).join('')}</div></div><div class="score" title="Avantage"><i style="left:${50 + w.score / 2}%"></i></div><small>${w.score > 15 ? 'Avantage aux attaquants' : w.score < -15 ? 'Avantage aux défenseurs' : 'Front indécis'}</small></div>`).join('');
}

function adminHtml(): string {
  const d = st!.selected;
  const others = st!.rows.filter((r) => r[1] && r[0] !== d?.id).map((r) => `<option value="${r[0]}" ${ui.adminOther === r[0] ? 'selected' : ''}>${name(r[0])}</option>`).join('');
  const opts = (rec: Record<string, string>, cur: string) => Object.entries(rec).map(([k, v]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${h(v)}</option>`).join('');
  return `<label class="switch"><input type="checkbox" data-act="admin-toggle" ${ui.admin ? 'checked' : ''}> Mode administrateur</label>
    <p class="hint">${ui.admin ? 'Vous pouvez intervenir dans le monde. Chaque intervention est inscrite au journal.' : 'Mode observateur : toutes les nations sont autonomes, vous ne modifiez rien.'}</p>
    ${!ui.admin ? '' : !d ? '<p class="alert">Touchez une nation sur la carte pour la modifier.</p>' : `
    ${section(`Modifier ${h(d.name)}`, `<form data-form="edit" class="form">
      <label>Nom<input name="name" value="${h(d.name)}" maxlength="40"></label>
      <label>Gouvernement<select name="government">${opts(GOV_FR, d.government)}</select></label>
      <label>Idéologie<select name="ideology">${opts(IDEO_FR, d.ideology)}</select></label>
      <label>Dirigeant<select name="leaderTrait">${opts(TRAIT_FR, d.leader.trait)}</select></label>
      <label>Stabilité (0–100)<input name="stability" type="number" inputmode="decimal" value="${Math.round(d.stability)}"></label>
      <label>Trésor (Md$)<input name="treasury" type="number" inputmode="decimal" step="any" value="${d.treasury.toFixed(1)}"></label>
      <label>Technologie (0–120)<input name="tech" type="number" inputmode="decimal" value="${Math.round(d.tech)}"></label>
      <label>Équipement terrestre<input name="army" type="number" inputmode="decimal" step="any" value="${d.mil.army.toFixed(1)}"></label>
      <button class="wide">Appliquer</button></form>`)}
    ${section('Provoquer un événement', `<div class="buttons">${[['boom', 'Boom économique'], ['discovery', 'Percée scientifique'], ['unrest', 'Troubles'], ['epidemic', 'Épidémie'], ['disaster', 'Catastrophe'], ['coup', 'Effondrement du régime']].map(([k, l]) => `<button data-act="admin-event" data-id="${k}">${l}</button>`).join('')}</div>`)}
    ${section('Relations avec une autre nation', `<label class="form">Autre nation<select data-act="admin-other"><option value="-1">Choisir…</option>${others}</select></label>
      <div class="buttons"><button data-act="admin-war">Provoquer une guerre</button><button data-act="admin-treaty" data-id="defense_pact">Imposer une alliance</button><button data-act="admin-treaty" data-id="trade">Imposer un accord commercial</button><button data-act="admin-opinion" data-id="80">Relations excellentes</button><button data-act="admin-opinion" data-id="-80">Relations exécrables</button></div>`)}
    ${section('Frontières', `<label class="switch"><input type="checkbox" data-act="paint" ${ui.paint ? 'checked' : ''}> Pinceau : toucher la carte donne la case à ${h(d.name)}</label><button class="wide" data-act="peek-map">Voir la carte</button>`)}
    ${section('Ressources', '<p class="hint">Avec le pinceau désactivé, un gisement peut être ajouté sur la capitale.</p><div class="buttons">' + Object.entries(RES_FR).map(([k, l], i) => `<button data-act="admin-resource" data-id="${i}">${l}</button>`).join('') + '</div>')}`}
    ${st!.wars.length && ui.admin ? section('Imposer la paix', st!.wars.map((w) => `<button class="wide" data-act="admin-peace" data-id="${w.id}">${h(w.name)}</button>`).join('')) : ''}`;
}

function settingsHtml(): string {
  const c = init!.config;
  const l = st!.llm;
  return `${section('Partie', `<form data-form="new" class="form">
      <label>Monde<select name="roster"><option value="random">Nations tirées à la roue</option><option value="season1" ${c.roster === 'season1' ? 'selected' : ''}>Saison 1 de Nation Wheel (103 nations du wiki)</option></select></label>
      <label>Nombre de nations<input name="nations" type="number" inputmode="numeric" min="2" max="500" value="${c.nations}"></label>
      <label>Graine du monde<input name="seed" type="number" inputmode="numeric" value="${c.seed}"></label>
      <label>Taille de la carte<select name="size"><option value="80x45">Petite</option><option value="120x68" ${c.width === 120 ? 'selected' : ''}>Moyenne</option><option value="160x90" ${c.width === 160 ? 'selected' : ''}>Grande</option><option value="240x135" ${c.width === 240 ? 'selected' : ''}>Très grande</option></select></label>
      <button class="wide">Créer un nouveau monde</button></form>`)}
    ${section('Sauvegardes', `<form data-form="save" class="form inline"><input name="name" placeholder="Nom de la sauvegarde" maxlength="40" required><button>Sauvegarder</button></form><div id="saves"><p class="empty">Chargement…</p></div>
      <div class="buttons"><button data-act="export">Exporter un fichier</button><button data-act="import">Importer un fichier</button></div>`)}
    ${section('LLM local', `<p>${l.available ? `Connecté : <b>${h(l.runtime)}</b> (${h(l.models)})` : 'Aucun LLM connecté : les nations décident avec le moteur comportemental.'}</p>
      ${l.available ? `<label class="switch"><input type="checkbox" data-act="llm-toggle" ${l.enabled ? 'checked' : ''}> Utiliser le LLM pour les décisions importantes</label>` : ''}
      <div id="about"></div>
      ${client.mode === 'local' ? `<form data-form="llm" class="form"><p class="hint">Brancher un LLM qui tourne sur un ordinateur du réseau local.</p>
        <label>Type<select name="runtime"><option value="ollama">Ollama</option><option value="openai-compatible">Compatible OpenAI (llama.cpp, LM Studio, vLLM)</option></select></label>
        <label>Adresse<input name="url" placeholder="http://192.168.1.10:11434" required></label>
        <label>Modèle<input name="model" value="qwen3.5:4b" required></label><button class="wide">Tester et connecter</button></form>` : ''}`)}
    ${section('Affichage', `<label class="form">Qualité de la carte<select data-act="quality"><option value="0.5" ${map.quality < 1 ? 'selected' : ''}>Économe</option><option value="1" ${map.quality === 1 ? 'selected' : ''}>Normale</option><option value="2" ${map.quality > 1 ? 'selected' : ''}>Élevée</option></select></label>`)}
    <p class="hint">${client.mode === 'server' ? 'Mode serveur : la simulation tourne sur l\'ordinateur qui héberge cette page.' : 'Mode autonome : la simulation tourne dans ce navigateur.'} Aucune donnée ne quitte votre réseau.</p>`;
}

const TITLES: Record<string, string> = { nations: 'Nations', diplomatie: 'Diplomatie', evenements: 'Événements', plus: 'Plus', economie: 'Économie', militaire: 'Militaire', chronologie: 'Chronologie', dev: 'Décisions des nations', admin: 'Administrateur', parametres: 'Paramètres' };

async function renderPanel(force = false): Promise<void> {
  const el = $('#panel');
  if (!ui.panel || !st) { el.hidden = true; return; }
  // Les formulaires ne sont pas redessinés pendant que l'on tape dedans.
  if (!force && (ui.panel === 'admin' || ui.panel === 'parametres' || ui.panel === 'chronologie' || ui.decision)) return;
  ui.lastPanelRender = performance.now();
  const which = ui.panel;
  const html = await panelBody();
  if (ui.panel !== which) return;
  el.hidden = false;
  $('#panel-title').textContent = TITLES[which];
  $('#panel-body').innerHTML = html;
  for (const c of el.querySelectorAll<HTMLCanvasElement>('canvas[data-world]')) {
    const idx = Number(c.dataset.world);
    const series = await client.cmd<{ tick: number; v: number[] }[]>({ type: 'series' });
    if (c.isConnected) lineChart(c, series.map((p) => ({ x: yearOf(p.tick), y: p.v[idx] })), idx === 1 ? money : idx === 3 ? (v) => `${Math.round(v)}` : big, (x) => `${Math.round(x)}`);
  }
  if (which === 'parametres') {
    client.saves().then((list) => { const box = document.getElementById('saves'); if (box) box.innerHTML = list.length ? `<ul class="saves">${list.map((s) => `<li><span><b>${h(s.name)}</b><small>${new Date(s.time).toLocaleString('fr-FR')}</small></span><button data-act="load" data-id="${h(s.name)}">Charger</button><button data-act="del-save" data-id="${h(s.name)}" aria-label="Supprimer">🗑</button></li>`).join('')}</ul>` : empty('Aucune sauvegarde.'); });
    client.about().then((a) => { const box = document.getElementById('about'); if (box) box.innerHTML = `<ul class="plain small">${a.report.map((r) => `<li>${h(r)}</li>`).join('')}</ul>`; });
  }
}

// ---------- Barre du haut, carte ----------
function renderTop(): void {
  const s = st!;
  $('#date').textContent = s.date;
  $('#play').textContent = s.running ? '⏸' : '▶';
  $('#play').setAttribute('aria-label', s.running ? 'Pause' : 'Lecture');
  $('#speed').textContent = s.speed >= 1000 ? 'max' : `${s.speed}×`;
  $('#summary').textContent = `${s.world.alive} nations · ${big(s.world.pop)} hab. · ${s.wars.length} guerre${s.wars.length > 1 ? 's' : ''}`;
  const badge = $('#llm');
  badge.textContent = s.llm.available && s.llm.enabled ? 'LLM' : 'Sans LLM';
  badge.className = s.llm.available && s.llm.enabled ? 'on' : '';
}

function legend(): void {
  const el = $('#legend');
  const ramp = (colors: string[], a: string, b: string, title: string) => `<b>${title}</b><div><span>${a}</span><i style="background:linear-gradient(90deg,${colors.join(',')})"></i><span>${b}</span></div>`;
  el.innerHTML = map.mode === 'stability' ? ramp(SEQ, 'faible', 'forte', 'Stabilité') : map.mode === 'tech' ? ramp(SEQ, 'faible', 'avancée', 'Technologie')
    : map.mode === 'relations' ? (map.selected === null ? '<b>Touchez une nation pour voir ses relations</b>' : ramp(DIV, 'hostile', 'amical', `Relations de ${name(map.selected)}`))
    : map.mode === 'blocs' ? '<b>Blocs d\'alliances</b><div><span>Une couleur par bloc, gris = non aligné</span></div>'
    : map.mode === 'terrain' ? '<b>Terrain</b><div><span>Points jaunes : gisements</span></div>' : '';
  el.hidden = !el.innerHTML;
}

function syncMap(): void {
  const s = st!;
  map.nations = s.rows.map((r) => ({ id: r[0], name: infos[r[0]]?.name ?? '', capitalCell: infos[r[0]]?.capitalCell ?? 0, alive: !!r[1], stability: r[4], tech: r[10], bloc: r[8], atWar: !!r[9] }));
  const occ = new Set(s.occupied);
  const warKey = s.wars.map((w) => `${w.id}:${w.attackers.length}:${w.defenders.length}`).join('|');
  let dirty = s.infos.length > 0 || occ.size !== map.occupied.size || warKey !== (syncMap as unknown as { k: string }).k || map.mode === 'stability' || map.mode === 'tech' || map.mode === 'blocs';
  (syncMap as unknown as { k: string }).k = warKey;
  map.occupied = occ;
  map.wars = s.wars;
  if (map.selected !== s.selected?.id) { map.selected = s.selected?.id ?? null; dirty = true; }
  if (s.selected) { map.opinions = new Map(s.selected.relations.map((r) => [r.id, r])); if (map.mode === 'relations') dirty = true; }
  map.applyDiff(s.ownerDiff);
  if (dirty) map.invalidate(); else map.redraw();
}

function showHistory(): void {
  const hist = ui.history;
  if (!hist || ui.historyIndex < 0 || ui.historyIndex >= hist.snapshots.length) { map.historyOwner = null; map.invalidate(); return; }
  const owner = Int16Array.from(hist.initialOwner);
  for (let i = 0; i < ui.historyIndex; i++) { const d = hist.snapshots[i].diff; for (let j = 0; j < d.length; j += 2) owner[d[j]] = d[j + 1]; }
  map.historyOwner = owner;
  map.invalidate();
}

// ---------- Messages de l'hôte ----------
function onMessage(m: InitMsg | StateMsg): void {
  if (m.type === 'init') {
    init = m;
    infos.length = 0;
    journal.length = 0;
    ui.history = null; ui.historyIndex = -1; ui.decision = null;
    map.setMap(m.map, m.map.owner);
    m = m.state;
  }
  const first = !st;
  st = m;
  for (const i of m.infos) infos[i.id] = i;
  for (const e of m.journal) {
    journal.push(e);
    if (!first && MAJOR.includes(e.type) && m.speed < 30) toast(e.text, e.type === 'peace' ? 'good' : 'warn');
  }
  if (journal.length > 3000) journal.splice(0, journal.length - 3000);
  renderTop();
  syncMap();
  legend();
  const now = performance.now();
  if (now - ui.lastPanelRender > 700) {
    ui.lastPanelRender = now;
    if (!ui.decision && !document.activeElement?.closest('#sheet')) renderSheet();
    renderPanel();
  }
}

// ---------- Actions ----------
function openPanel(p: string | null): void {
  ui.panel = p; ui.decision = null; ui.shown = 60;
  if (p !== 'chronologie' && map.historyOwner) { ui.historyIndex = -1; showHistory(); }
  if (p === 'chronologie') ui.history = null;
  $('#panel').classList.remove('peek');
  for (const b of document.querySelectorAll<HTMLElement>('#nav button')) b.classList.toggle('on', (b.dataset.id ?? 'carte') === (p ?? 'carte') || (b.dataset.id === 'plus' && !!p && !['nations', 'diplomatie', 'evenements'].includes(p)));
  if (!p) $('#panel').hidden = true;
  renderPanel(true);
}
async function select(id: number | null): Promise<void> {
  ui.decision = null;
  await client.cmd({ type: 'select', nation: id });
  if (id !== null) { map.focus(id); if (ui.panel && ui.panel !== 'admin') openPanel(null); else if (ui.panel === 'admin') renderPanel(true); }
  renderSheet();
}
const admin = async (command: Record<string, unknown>, ok: string) => {
  const r = await client.cmd<{ ok: boolean; error: string | null }>({ type: 'admin', command });
  toast(r.ok ? ok : `Refusé : ${r.error}`, r.ok ? 'good' : 'bad');
  if (r.ok) renderPanel(true);
};

document.addEventListener('click', async (ev) => {
  const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (!el || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'checkbox')) return;
  const id = el.dataset.id ?? '';
  const sel = st?.selected?.id;
  switch (el.dataset.act) {
    case 'play': await client.cmd({ type: st!.running ? 'pause' : 'play' }); break;
    case 'step': await client.cmd({ type: 'step' }); break;
    case 'speed': { const speeds = [1, 2, 5, 12, 30, 1000]; await client.cmd({ type: 'speed', value: speeds[(speeds.indexOf(st!.speed) + 1) % speeds.length] }); break; }
    case 'panel': openPanel(id === 'carte' ? null : id); break;
    case 'close-panel': openPanel(null); break;
    case 'peek-map': $('#panel').classList.toggle('peek'); break;
    case 'select': await select(Number(id)); break;
    case 'close-sheet': await select(null); break;
    case 'tab': ui.sheetTab = id; ui.decision = null; if (ui.sheetSize === 'peek') ui.sheetSize = 'half'; renderSheet(); break;
    case 'sheet-size': ui.sheetSize = ui.sheetSize === 'peek' ? 'half' : ui.sheetSize === 'half' ? 'full' : 'peek'; $('#sheet').dataset.size = ui.sheetSize; break;
    case 'sort': ui.sort = id; renderPanel(true); break;
    case 'more': ui.shown += 100; renderPanel(true); break;
    case 'jfilter': ui.journalFilter = id; renderPanel(true); break;
    case 'mode': map.mode = id as MapMode; for (const b of document.querySelectorAll('#modes button')) b.classList.toggle('on', b === el); map.invalidate(); legend(); break;
    case 'fit': map.fit(); break;
    case 'decision': ui.decision = await client.cmd({ type: 'decision', id: Number(id) }); ui.panel === 'dev' ? renderPanel(true) : renderSheet(); break;
    case 'decision-back': ui.decision = null; ui.panel === 'dev' ? renderPanel(true) : renderSheet(); break;
    case 'admin-toggle': ui.admin = (el as HTMLInputElement).checked; if (!ui.admin) ui.paint = false; renderPanel(true); break;
    case 'paint': ui.paint = (el as HTMLInputElement).checked; if (ui.paint) { $('#panel').classList.add('peek'); toast('Pinceau actif : touchez la carte.'); } break;
    case 'admin-event': if (sel !== undefined) await admin({ op: 'event', nation: sel, kind: id }, 'Événement provoqué.'); break;
    case 'admin-war': if (sel !== undefined && ui.adminOther >= 0) await admin({ op: 'force_war', a: sel, b: ui.adminOther }, 'Guerre déclenchée.'); else toast('Choisissez une autre nation.', 'bad'); break;
    case 'admin-treaty': if (sel !== undefined && ui.adminOther >= 0) await admin({ op: 'force_treaty', a: sel, b: ui.adminOther, kind: id }, 'Traité imposé.'); else toast('Choisissez une autre nation.', 'bad'); break;
    case 'admin-opinion': if (sel !== undefined && ui.adminOther >= 0) await admin({ op: 'set_opinion', a: sel, b: ui.adminOther, opinion: Number(id) }, 'Relations modifiées.'); else toast('Choisissez une autre nation.', 'bad'); break;
    case 'admin-peace': await admin({ op: 'force_peace', war: Number(id) }, 'Paix imposée.'); break;
    case 'admin-resource': if (sel !== undefined) await admin({ op: 'set_resource', cell: infos[sel].capitalCell, resource: Number(id) }, 'Gisement ajouté.'); break;
    case 'llm-toggle': await client.cmd({ type: 'llm', enabled: (el as HTMLInputElement).checked }); break;
    case 'load': await run(client.load(id), 'Partie chargée.'); break;
    case 'del-save': await run(client.remove(id)); renderPanel(true); break;
    case 'export': { const data = await client.cmd<string>({ type: 'export' }); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' })); a.download = `nation-wheel-${st!.year}.json`; a.click(); URL.revokeObjectURL(a.href); break; }
    case 'import': $<HTMLInputElement>('#file').click(); break;
  }
});

document.addEventListener('change', (ev) => {
  const el = ev.target as HTMLInputElement | HTMLSelectElement;
  if (el.dataset.act === 'admin-other') ui.adminOther = Number(el.value);
  if (el.dataset.act === 'quality') { map.quality = Number(el.value); map.invalidate(); try { localStorage.setItem('quality', el.value); } catch { /* stockage indisponible */ } }
  if (el.id === 'file' && (el as HTMLInputElement).files?.[0]) (el as HTMLInputElement).files![0].text().then((data) => run(client.cmd({ type: 'import', data }), 'Partie importée.'));
});
document.addEventListener('input', (ev) => {
  const el = ev.target as HTMLInputElement;
  if (el.dataset.act !== 'history') return;
  ui.historyIndex = Number(el.value);
  showHistory();
  const hist = ui.history!;
  const i = ui.historyIndex;
  el.nextElementSibling!.textContent = i >= hist.snapshots.length ? `Aujourd'hui (${st!.year})` : `${i === 0 ? hist.startYear : yearOf(hist.snapshots[i - 1].tick)}`;
});
document.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const form = ev.target as HTMLFormElement;
  const f = Object.fromEntries(new FormData(form)) as Record<string, string>;
  if (form.dataset.form === 'new') {
    const [width, height] = f.size.split('x').map(Number);
    await run(client.cmd({ type: 'new', config: { nations: Number(f.nations), seed: Number(f.seed), width, height, roster: f.roster } }), 'Nouveau monde créé.');
    openPanel(null);
  } else if (form.dataset.form === 'save') { await run(client.save(f.name.trim()), 'Partie sauvegardée.'); renderPanel(true); }
  else if (form.dataset.form === 'llm') await run(client.cmd({ type: 'llm_connect', ...f }), 'LLM connecté.');
  else if (form.dataset.form === 'edit' && st?.selected) {
    const d = st.selected;
    const patch: Record<string, unknown> = {};
    if (f.name.trim() && f.name.trim() !== d.name) patch.name = f.name.trim();
    if (f.government !== d.government) patch.government = f.government;
    if (f.ideology !== d.ideology) patch.ideology = f.ideology;
    if (f.leaderTrait !== d.leader.trait) patch.leaderTrait = f.leaderTrait;
    const numbers: [string, number][] = [['stability', Math.round(d.stability)], ['treasury', +d.treasury.toFixed(1)], ['tech', Math.round(d.tech)], ['army', +d.mil.army.toFixed(1)]];
    for (const [k, cur] of numbers) if (f[k] !== '' && Number(f[k]) !== cur) patch[k] = Number(f[k]);
    if (!Object.keys(patch).length) return toast('Rien à modifier.');
    await admin({ op: 'edit_nation', nation: d.id, patch }, 'Nation modifiée.');
  }
});

// ---------- Démarrage ----------
(async () => {
  map = new MapView($<HTMLCanvasElement>('#map'));
  try { map.quality = Number(localStorage.getItem('quality')) || (navigator.hardwareConcurrency <= 4 ? 0.5 : 1); } catch { /* valeur par défaut */ }
  map.onTap = (cell, owner) => {
    if (ui.admin && ui.paint && st?.selected) { admin({ op: 'set_cells', cells: [cell], owner: st.selected.id }, 'Frontière modifiée.'); return; }
    if (owner >= 0) select(owner); else if (st?.selected) select(null);
  };
  client = await connect();
  client.onMessage(onMessage);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
