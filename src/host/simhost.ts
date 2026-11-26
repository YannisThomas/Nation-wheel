// Hôte de simulation : fait tourner le monde et parle à l'interface par
// messages. Le même code tourne dans le serveur Node (PC ou serveur personnel)
// et dans un Web Worker (mode mobile autonome).

import { Director, DEFAULT_DECISION_CONFIG, type Chooser, type DecisionConfig, type DecisionRecord } from '../agents/director';
import { recall } from '../agents/memory';
import { background, goals, preferences, surroundings } from '../agents/profile';
import { adminCommand, type AdminCommand } from '../engine/admin';
import { peekRel, pendingFor } from '../engine/diplomacy';
import { formatDate } from '../engine/journal';
import { createWorld, step } from '../engine/sim';
import { sideOf, warsOf } from '../engine/war';
import type { JournalEntry, Nation, SimConfig, World } from '../engine/types';

export const STATUSES = ['microstate', 'minor_power', 'middle_power', 'regional_power', 'great_power', 'superpower'];

/** Ligne compacte par nation, envoyée à chaque mise à jour :
 * [id, vivante, population, PIB, stabilité, cellules, puissance, statut, bloc, en guerre, technologie, IDH] */
export type NationRow = number[];

export interface NationInfo {
  id: number; name: string; capitalName: string; capitalCell: number; flag: Nation['flag'];
  government: string; govLabel: string; overlord: number; colony: boolean; ideology: string; culture: string; leader: string; trait: string; alive: boolean; founded: number;
}

export interface WarView { id: number; name: string; attackers: number[]; defenders: number[]; start: number; score: number; casualties: number }
export interface LlmStatus { enabled: boolean; available: boolean; runtime: string; models: string; llm: number; cache: number; fallback: number; behavior: number }

export interface StateMsg {
  type: 'state';
  tick: number; date: string; year: number; running: boolean; speed: number;
  rows: NationRow[];
  infos: NationInfo[];
  wars: WarView[];
  journal: JournalEntry[];
  /** Changements de propriétaire depuis le dernier message : [cellule, propriétaire, …]. */
  ownerDiff: number[];
  /** Cellules occupées dans une guerre en cours. */
  occupied: number[];
  world: { pop: number; gdp: number; alive: number; warsEnded: number; pacts: number; trades: number };
  llm: LlmStatus;
  decisions: (DecisionRecord & { id: number })[];
  selected: NationDetail | null;
}

export interface InitMsg {
  type: 'init';
  config: SimConfig;
  map: { width: number; height: number; terrain: number[]; river: number[]; resource: number[]; owner: number[]; elevation: number[] };
  state: StateMsg;
}

export type NationDetail = ReturnType<SimHost['detail']>;

export type Command =
  | { type: 'play' } | { type: 'pause' } | { type: 'step' } | { type: 'speed'; value: number }
  | { type: 'select'; nation: number | null }
  | { type: 'init' }
  | { type: 'decisions'; nation?: number; limit?: number }
  | { type: 'decision'; id: number }
  | { type: 'series'; nation?: number }
  | { type: 'history' }
  | { type: 'journal'; nation?: number; kinds?: string[]; before?: number; limit?: number }
  | { type: 'diplomacy' }
  | { type: 'new'; config: Partial<SimConfig> }
  | { type: 'export' } | { type: 'import'; data: string }
  | { type: 'admin'; command: AdminCommand }
  | { type: 'llm'; enabled: boolean };

interface Sample { tick: number; v: number[] }
export interface SaveFile { format: 'nation-wheel-save'; version: 1; world: World; worldSeries: Sample[]; nationSeries: Record<number, Sample[]>; initialOwner: number[]; snapshots: { tick: number; diff: number[] }[] }

const MAX_POINTS = 240;
/** Garde les séries bornées : au-delà de MAX_POINTS, un point sur deux est retiré. */
function push(series: Sample[], s: Sample): void {
  series.push(s);
  if (series.length > MAX_POINTS) for (let i = series.length - 2; i > 0; i -= 2) series.splice(i, 1);
}

export class SimHost {
  world!: World;
  director: Director;
  running = false;
  speed = 2;
  selected: number | null = null;
  llmEnabled = true;
  llmInfo = { available: false, runtime: 'aucun', models: '' };

  private chooser: Chooser | null = null;
  private listeners = new Set<(msg: StateMsg | InitMsg) => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private busy = false;
  private lastEmit = 0;
  private sentJournalId = 0;
  private sentOwner: number[] = [];
  private sentInfo = new Map<number, string>();
  private records: (DecisionRecord & { id: number })[] = [];
  private nextRecordId = 1;
  private unsentRecords: (DecisionRecord & { id: number })[] = [];
  private worldSeries: Sample[] = [];
  private nationSeries: Record<number, Sample[]> = {};
  private initialOwner: number[] = [];
  private snapshotOwner: number[] = [];
  private snapshots: { tick: number; diff: number[] }[] = [];

  constructor(config: Partial<SimConfig> = {}, private decisionConfig: DecisionConfig = DEFAULT_DECISION_CONFIG, private now: () => number = () => Date.now()) {
    this.director = new Director(decisionConfig, null);
    this.reset(createWorld(config));
  }

  setChooser(chooser: Chooser | null, info: { runtime: string; models: string }): void {
    this.chooser = chooser;
    this.llmInfo = { available: chooser !== null, ...info };
    this.director.chooser = this.llmEnabled ? chooser : null;
  }

  onMessage(cb: (msg: StateMsg | InitMsg) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private reset(world: World, save?: SaveFile): void {
    this.world = world;
    this.director = new Director(this.decisionConfig, this.llmEnabled ? this.chooser : null);
    this.records = [];
    this.unsentRecords = [];
    this.sentJournalId = Math.max(0, world.nextJournalId - 1 - 100);
    this.sentOwner = [...world.map.owner];
    this.sentInfo.clear();
    this.worldSeries = save?.worldSeries ?? [];
    this.nationSeries = save?.nationSeries ?? {};
    this.initialOwner = save?.initialOwner ?? [...world.map.owner];
    this.snapshots = save?.snapshots ?? [];
    this.snapshotOwner = [...this.initialOwner];
    for (const s of this.snapshots) for (let i = 0; i < s.diff.length; i += 2) this.snapshotOwner[s.diff[i]] = s.diff[i + 1];
    this.selected = null;
    if (!this.worldSeries.length) this.sample();
  }

  // ---- Boucle ----

  private schedule(): void {
    if (this.timer || !this.running) return;
    const delay = this.speed >= 1000 ? 0 : 1000 / this.speed;
    this.timer = setTimeout(async () => {
      this.timer = null;
      // À vitesse maximale, plusieurs ticks par tour d'horloge.
      const batch = this.speed >= 1000 ? 25 : 1;
      for (let i = 0; i < batch && this.running; i++) await this.tick();
      this.emit();
      this.schedule();
    }, delay);
  }

  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const w = this.world;
      const out = this.director.chooser ? await this.director.decide(w) : this.director.decideSync(w);
      this.director.attachResults(step(w, out.actions));
      for (const r of out.records) {
        // Le panneau développeur garde tout ce qui n'est pas une attente silencieuse.
        if (r.chosen === 'wait' && r.source === 'behavior') continue;
        const rec = { ...r, id: this.nextRecordId++ };
        this.records.push(rec);
        this.unsentRecords.push({ ...rec, context: undefined });
      }
      if (this.records.length > 600) this.records.splice(0, this.records.length - 600);
      for (let i = 0; i < this.records.length - 150; i++) this.records[i].context = undefined;
      if (w.tick % 12 === 0) this.sample();
      if (w.tick % 60 === 0) this.snapshot();
    } finally {
      this.busy = false;
    }
  }

  private sample(): void {
    const w = this.world;
    let pop = 0; let gdp = 0; let alive = 0;
    for (const n of w.nations) {
      if (!n.alive) continue;
      pop += n.pop; gdp += n.gdp; alive++;
      push((this.nationSeries[n.id] ??= []), { tick: w.tick, v: [n.pop, n.gdp, n.stability, n.geo.cells, n.mil.power, n.tech] });
    }
    push(this.worldSeries, { tick: w.tick, v: [pop, gdp, alive, w.wars.length] });
  }

  private snapshot(): void {
    const owner = this.world.map.owner;
    const diff: number[] = [];
    for (let i = 0; i < owner.length; i++) if (owner[i] !== this.snapshotOwner[i]) { diff.push(i, owner[i]); this.snapshotOwner[i] = owner[i]; }
    if (diff.length) this.snapshots.push({ tick: this.world.tick, diff });
  }

  // ---- Messages vers l'interface ----

  private info(n: Nation): NationInfo {
    return { id: n.id, name: n.name, capitalName: n.capitalName, capitalCell: n.capitalCell, flag: n.flag, government: n.government, govLabel: n.wheel.government, overlord: n.overlord, colony: n.colony, ideology: n.ideology, culture: n.culture, leader: n.leader.name, trait: n.leader.trait, alive: n.alive, founded: n.foundedTick };
  }

  private state(full = false): StateMsg {
    const w = this.world;
    const atWar = new Set<number>();
    const occupied: number[] = [];
    for (const war of w.wars) {
      for (const id of [...war.attackers, ...war.defenders]) atWar.add(id);
      for (const c in war.captured) if (w.map.owner[+c] !== war.captured[c]) occupied.push(+c);
    }
    let pop = 0; let gdp = 0; let alive = 0;
    const rows: NationRow[] = [];
    const infos: NationInfo[] = [];
    for (const n of w.nations) {
      if (n.alive) { pop += n.pop; gdp += n.gdp; alive++; }
      rows.push([n.id, +n.alive, Math.round(n.pop), Math.round(n.gdp * 100) / 100, Math.round(n.stability), n.geo.cells, Math.round(n.mil.power), STATUSES.indexOf(n.status), n.bloc, +atWar.has(n.id), Math.round(n.tech), Math.round(n.hdi * 100) / 100]);
      const info = this.info(n);
      const key = JSON.stringify(info);
      if (full || this.sentInfo.get(n.id) !== key) { infos.push(info); this.sentInfo.set(n.id, key); }
    }
    const ownerDiff: number[] = [];
    const owner = w.map.owner;
    if (full) this.sentOwner = [...owner];
    else {
      for (let i = 0; i < owner.length; i++) if (owner[i] !== this.sentOwner[i]) { ownerDiff.push(i, owner[i]); this.sentOwner[i] = owner[i]; }
    }
    const journal = w.journal.filter((e) => e.id > this.sentJournalId);
    if (journal.length) this.sentJournalId = journal[journal.length - 1].id;
    let pacts = 0; let trades = 0;
    for (const k in w.relations) { if (w.relations[k].defense_pact >= 0) pacts++; if (w.relations[k].trade >= 0) trades++; }
    const decisions = this.unsentRecords;
    this.unsentRecords = [];
    const s = this.director.stats;
    return {
      type: 'state', tick: w.tick, date: formatDate(w), year: w.config.startYear + Math.floor(w.tick / 12), running: this.running, speed: this.speed,
      rows, infos, journal: journal.slice(-200), ownerDiff, occupied,
      wars: w.wars.map((x) => ({ id: x.id, name: x.name, attackers: x.attackers, defenders: x.defenders, start: x.start, score: Math.round(x.score), casualties: Math.round(Object.values(x.casualties).reduce((a, b) => a + b, 0)) })),
      world: { pop, gdp, alive, warsEnded: w.warsEnded, pacts, trades },
      llm: { enabled: this.llmEnabled, ...this.llmInfo, llm: s.llm, cache: s.cache, fallback: s.fallback, behavior: s.behavior },
      decisions: decisions.slice(-60),
      selected: this.selected !== null && w.nations[this.selected] ? this.detail(this.selected) : null,
    };
  }

  init(): InitMsg {
    const m = this.world.map;
    return { type: 'init', config: this.world.config, map: { width: m.width, height: m.height, terrain: m.terrain, river: m.river, resource: m.resource, owner: m.owner, elevation: m.elevation }, state: this.state(true) };
  }

  emit(force = false): void {
    const t = this.now();
    if (!force && t - this.lastEmit < 150) return;
    this.lastEmit = t;
    const msg = this.state();
    for (const cb of this.listeners) cb(msg);
  }

  private broadcastInit(): void {
    const msg = this.init();
    for (const cb of this.listeners) cb(msg);
  }

  /** Fiche complète d'une nation, esprit compris. */
  detail(id: number) {
    const w = this.world;
    const n = w.nations[id];
    const around = surroundings(w, n);
    const prefs = preferences(w, n, around);
    const relations = w.nations.filter((o) => o.alive && o.id !== id && peekRel(w, id, o.id)).map((o) => {
      const r = peekRel(w, id, o.id)!;
      const d = id < o.id ? 0 : 1;
      return { id: o.id, opinion: Math.round(r.opinion), trade: r.trade >= 0, nap: r.non_aggression >= 0, pact: r.defense_pact >= 0, atWar: r.atWar, sanctioning: r.sanctions[d], sanctioned: r.sanctions[1 - d], claiming: r.claims[d], claimed: r.claims[1 - d], truce: r.truceUntil > w.tick, feeling: Math.round(n.mind.attitudes[o.id] ?? 0), neighbor: n.geo.neighbors[o.id] !== undefined };
    }).sort((a, b) => +b.atWar - +a.atWar || +b.pact - +a.pact || Math.abs(b.opinion) - Math.abs(a.opinion));
    const { mind, ...rest } = n;
    return {
      ...rest,
      background: background(w, n, around), prefs, goals: goals(n, prefs, around),
      threat: Math.round(around.threat * 100), mainThreat: around.mainThreat,
      relations,
      wars: warsOf(w, id).map((x) => ({ id: x.id, name: x.name, side: sideOf(x, id), stance: x.stance[id], edge: Math.round(x.score * (sideOf(x, id) === 'attackers' ? 1 : -1)), casualties: Math.round(x.casualties[id] ?? 0) })),
      proposals: pendingFor(w, id).map((p) => ({ from: p.from, kind: p.kind })),
      memory: { recalled: n.alive ? recall(w, n, [], 10) : [], historical: mind.historical, counters: mind.counters },
    };
  }

  // ---- Commandes de l'interface ----

  async handle(cmd: Command): Promise<unknown> {
    const w = this.world;
    switch (cmd?.type) {
      case 'init': return this.init();
      case 'play': this.running = true; this.schedule(); this.emit(true); return true;
      case 'pause': this.running = false; this.emit(true); return true;
      case 'step': this.running = false; await this.tick(); this.emit(true); return true;
      case 'speed': this.speed = Math.min(1000, Math.max(0.5, Number(cmd.value) || 1)); this.emit(true); return true;
      case 'select': this.selected = typeof cmd.nation === 'number' && w.nations[cmd.nation] ? cmd.nation : null; this.emit(true); return true;
      case 'decisions': return this.records.filter((r) => cmd.nation === undefined || r.nation === cmd.nation).slice(-(cmd.limit ?? 60)).map((r) => ({ ...r, context: undefined })).reverse();
      case 'decision': return this.records.find((r) => r.id === cmd.id) ?? null;
      case 'series': return cmd.nation === undefined ? this.worldSeries : this.nationSeries[cmd.nation] ?? [];
      case 'history': return { initialOwner: this.initialOwner, snapshots: this.snapshots, startYear: w.config.startYear };
      case 'journal': {
        let list = w.journal;
        if (cmd.nation !== undefined) list = list.filter((e) => e.nations.includes(cmd.nation!));
        if (cmd.kinds?.length) list = list.filter((e) => cmd.kinds!.includes(e.type));
        if (cmd.before !== undefined) list = list.filter((e) => e.id < cmd.before!);
        return list.slice(-(cmd.limit ?? 100)).reverse();
      }
      case 'diplomacy': {
        const pacts: number[][] = []; const sanctions: number[][] = []; const trades: number[][] = [];
        for (const k in w.relations) {
          const [a, b] = k.split(':').map(Number);
          const r = w.relations[k];
          if (r.defense_pact >= 0) pacts.push([a, b]);
          if (r.trade >= 0) trades.push([a, b]);
          if (r.sanctions[0]) sanctions.push([a, b]);
          if (r.sanctions[1]) sanctions.push([b, a]);
        }
        return { pacts, sanctions, trades, proposals: w.proposals.map((p) => ({ from: p.from, to: p.to, kind: p.kind })) };
      }
      case 'new': this.running = false; this.reset(createWorld(cmd.config ?? {})); this.broadcastInit(); return true;
      case 'export': return JSON.stringify(this.exportSave());
      case 'import': {
        const save = JSON.parse(cmd.data) as SaveFile;
        if (save?.format !== 'nation-wheel-save' || save.version !== 1 || save.world?.version !== 1) throw new Error('Fichier de sauvegarde non reconnu');
        this.running = false;
        this.reset(save.world, save);
        this.broadcastInit();
        return true;
      }
      case 'admin': {
        const error = adminCommand(w, cmd.command);
        if (!error) this.emit(true);
        return { ok: !error, error };
      }
      case 'llm': this.llmEnabled = !!cmd.enabled; this.director.chooser = this.llmEnabled ? this.chooser : null; this.emit(true); return true;
      default: throw new Error('Commande inconnue');
    }
  }

  exportSave(): SaveFile {
    return { format: 'nation-wheel-save', version: 1, world: this.world, worldSeries: this.worldSeries, nationSeries: this.nationSeries, initialOwner: this.initialOwner, snapshots: this.snapshots };
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
