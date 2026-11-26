// Carte interactive sur Canvas. La carte est peinte une fois dans un calque
// hors écran, puis simplement déplacée et zoomée : fluide au doigt, même sur
// un téléphone de milieu de gamme.

import { neighborTable } from '../../src/engine/map';

export type MapMode = 'political' | 'terrain' | 'blocs' | 'stability' | 'tech' | 'relations';
export interface MapNation { id: number; name: string; capitalCell: number; alive: boolean; stability: number; tech: number; bloc: number; atWar: boolean }
export interface MapData { width: number; height: number; terrain: number[]; river: number[]; resource: number[] }

const SQ3 = Math.sqrt(3);
// Arête partagée avec chaque voisin (ordre de neighborTable : O, E, NO, NE, SO, SE).
const EDGE = [[3, 4], [0, 1], [4, 5], [5, 0], [2, 3], [1, 2]];
const CORNER = [0, 1, 2, 3, 4, 5].map((i) => { const a = ((60 * i - 30) * Math.PI) / 180; return [Math.cos(a), Math.sin(a)]; });
const TERRAIN_COLORS = ['#12283f', '#5d7f45', '#33603a', '#857a4d', '#8b8680', '#b89f62', '#a9b7ba'];
const OCEAN = '#12283f';
const FREE = '#3a3f38';
/** Rampe séquentielle bleue : sur fond sombre, le clair signifie « élevé ». */
export const SEQ = ['#0e3d7e', '#1757ac', '#2370cd', '#338ced', '#6aabf1', '#9dc8f7', '#cce3fd'];
/** Rampe divergente rouge ↔ gris neutre ↔ bleu. */
export const DIV = ['#c9302f', '#a84444', '#6e4444', '#444444', '#3d5878', '#2f6fb8', '#338ced'];

export const nationColor = (id: number, l = 44) => `hsl(${(id * 137.508) % 360} 46% ${l + (id % 3) * 5}%)`;
const step = (ramp: string[], t: number) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(t * ramp.length)))];

export class MapView {
  mode: MapMode = 'political';
  selected: number | null = null;
  owner: Int16Array = new Int16Array(0);
  /** Carte d'un autre moment (chronologie) ; remplace `owner` à l'affichage. */
  historyOwner: Int16Array | null = null;
  nations: MapNation[] = [];
  occupied = new Set<number>();
  /** Opinion de la nation sélectionnée envers les autres, pour le mode relations. */
  opinions = new Map<number, { opinion: number; atWar: boolean; pact: boolean }>();
  wars: { attackers: number[]; defenders: number[] }[] = [];
  onTap: (cell: number, owner: number) => void = () => {};
  quality = 1;

  private ctx: CanvasRenderingContext2D;
  private base = document.createElement('canvas');
  private map: MapData | null = null;
  private nb: Int32Array = new Int32Array(0);
  private k = 1; private tx = 0; private ty = 0;
  private dirty = true; private baseDirty = true;
  private centroids = new Map<number, { x: number; y: number; n: number }>();
  private pointers = new Map<number, { x: number; y: number }>();
  private gesture = { moved: 0, start: 0, dist: 0 };
  private unit = 8;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    for (const t of ['pointerup', 'pointercancel', 'pointerleave'] as const) canvas.addEventListener(t, (e) => this.up(e));
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    new ResizeObserver(() => this.resize()).observe(canvas);
    const loop = () => { if (this.dirty || this.baseDirty) this.draw(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  setMap(map: MapData, owner: number[]): void {
    this.map = map;
    this.nb = neighborTable(map.width, map.height);
    this.owner = Int16Array.from(owner);
    this.historyOwner = null;
    this.resize();
    this.fit();
    this.invalidate();
  }

  applyDiff(diff: number[]): void {
    for (let i = 0; i < diff.length; i += 2) this.owner[diff[i]] = diff[i + 1];
    if (diff.length && !this.historyOwner) this.invalidate();
  }

  /** Redessine le calque de base au prochain rafraîchissement. */
  invalidate(): void { this.baseDirty = true; }
  redraw(): void { this.dirty = true; }

  private worldSize(): [number, number] { return this.map ? [SQ3 * (this.map.width + 0.5), 1.5 * this.map.height + 0.5] : [1, 1]; }
  private center(i: number): [number, number] {
    const w = this.map!.width;
    const row = Math.floor(i / w);
    return [SQ3 * ((i % w) + 0.5 * (row & 1) + 0.5), 1.5 * row + 1];
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality > 1 ? 2 : 1.5);
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.dirty = true;
  }

  fit(): void {
    const [W, H] = this.worldSize();
    this.k = Math.max(this.canvas.width / W, this.canvas.height / H) * 0.9;
    this.tx = (this.canvas.width - W * this.k) / 2;
    this.ty = (this.canvas.height - H * this.k) / 2;
    this.dirty = true;
  }

  focus(id: number): void {
    const c = this.centroids.get(id);
    if (!c) return;
    const cells = c.n;
    this.k = Math.min(this.maxK(), Math.max(this.k, Math.min(this.canvas.width, this.canvas.height) / (Math.sqrt(cells) * 6)));
    this.tx = this.canvas.width / 2 - (c.x / c.n) * this.k;
    // Un peu plus haut que le centre : la fiche occupe le bas de l'écran.
    this.ty = this.canvas.height * 0.36 - (c.y / c.n) * this.k;
    this.dirty = true;
  }

  private maxK(): number { return Math.min(this.canvas.width, this.canvas.height) / 8; }
  private minK(): number { const [W, H] = this.worldSize(); return Math.min(this.canvas.width / W, this.canvas.height / H) * 0.7; }

  private zoomAt(x: number, y: number, f: number): void {
    const dpr = this.canvas.width / this.canvas.getBoundingClientRect().width;
    const px = x * dpr; const py = y * dpr;
    const k = Math.max(this.minK(), Math.min(this.maxK(), this.k * f));
    this.tx = px - ((px - this.tx) / this.k) * k;
    this.ty = py - ((py - this.ty) / this.k) * k;
    this.k = k;
    this.dirty = true;
  }

  private down(e: PointerEvent): void {
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (this.pointers.size === 1) this.gesture = { moved: 0, start: performance.now(), dist: 0 };
    if (this.pointers.size === 2) { const [a, b] = [...this.pointers.values()]; this.gesture.dist = Math.hypot(a.x - b.x, a.y - b.y); this.gesture.moved = 99; }
  }

  private move(e: PointerEvent): void {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dpr = this.canvas.width / this.canvas.getBoundingClientRect().width;
    const dx = e.offsetX - p.x; const dy = e.offsetY - p.y;
    if (this.pointers.size === 1) {
      this.tx += dx * dpr; this.ty += dy * dpr;
      this.gesture.moved += Math.abs(dx) + Math.abs(dy);
    }
    p.x = e.offsetX; p.y = e.offsetY;
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.gesture.dist > 0) this.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / this.gesture.dist);
      this.gesture.dist = d;
    }
    this.dirty = true;
  }

  private up(e: PointerEvent): void {
    if (!this.pointers.has(e.pointerId)) return;
    const tap = this.pointers.size === 1 && this.gesture.moved < 10 && performance.now() - this.gesture.start < 500 && e.type === 'pointerup';
    this.pointers.delete(e.pointerId);
    if (tap) { const cell = this.cellAt(e.offsetX, e.offsetY); if (cell >= 0) this.onTap(cell, (this.historyOwner ?? this.owner)[cell]); }
  }

  cellAt(x: number, y: number): number {
    if (!this.map) return -1;
    const dpr = this.canvas.width / this.canvas.getBoundingClientRect().width;
    const wx = (x * dpr - this.tx) / this.k; const wy = (y * dpr - this.ty) / this.k;
    const row0 = Math.round((wy - 1) / 1.5);
    let best = -1; let bd = Infinity;
    for (let row = row0 - 1; row <= row0 + 1; row++) {
      if (row < 0 || row >= this.map.height) continue;
      const col0 = Math.round(wx / SQ3 - 0.5 * (row & 1) - 0.5);
      for (let col = col0 - 1; col <= col0 + 1; col++) {
        if (col < 0 || col >= this.map.width) continue;
        const i = row * this.map.width + col;
        const [cx, cy] = this.center(i);
        const d = (cx - wx) ** 2 + (cy - wy) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
    }
    return bd < 1.2 ? best : -1;
  }

  private fill(owner: number, cell: number): string {
    const m = this.map!;
    if (m.terrain[cell] === 0) return OCEAN;
    if (this.mode === 'terrain') return TERRAIN_COLORS[m.terrain[cell]];
    if (owner < 0) return FREE;
    const n = this.nations[owner];
    switch (this.mode) {
      case 'blocs': return n && n.bloc >= 0 ? nationColor(n.bloc) : '#4a4a4a';
      case 'stability': return step(SEQ, (n?.stability ?? 0) / 100.01);
      case 'tech': return step(SEQ, (n?.tech ?? 0) / 120.01);
      case 'relations': {
        if (this.selected === null) return nationColor(owner);
        if (owner === this.selected) return '#e9e4d4';
        const r = this.opinions.get(owner);
        if (!r) return '#444444';
        return r.atWar ? DIV[0] : step(DIV, (r.opinion + 100) / 200.01);
      }
      default: return nationColor(owner);
    }
  }

  private renderBase(): void {
    const m = this.map;
    if (!m) return;
    const owner = this.historyOwner ?? this.owner;
    const [W, H] = this.worldSize();
    const u = (this.unit = Math.min(this.quality > 1 ? 14 : this.quality < 1 ? 5 : 9, 4096 / W));
    this.base.width = Math.ceil(W * u);
    this.base.height = Math.ceil(H * u);
    const c = this.base.getContext('2d')!;
    c.fillStyle = OCEAN;
    c.fillRect(0, 0, this.base.width, this.base.height);
    this.centroids.clear();
    const n = m.width * m.height;
    const hex = (cx: number, cy: number, r: number) => {
      c.beginPath();
      for (let i = 0; i < 6; i++) c.lineTo((cx + CORNER[i][0] * r) * u, (cy + CORNER[i][1] * r) * u);
      c.closePath();
    };
    for (let i = 0; i < n; i++) {
      if (m.terrain[i] === 0) continue;
      const [cx, cy] = this.center(i);
      c.fillStyle = this.fill(owner[i], i);
      hex(cx, cy, 1.03);
      c.fill();
      const o = owner[i];
      if (o >= 0) { const ct = this.centroids.get(o) ?? { x: 0, y: 0, n: 0 }; ct.x += cx; ct.y += cy; ct.n++; this.centroids.set(o, ct); }
      if (this.mode === 'terrain' && m.resource[i] >= 0) { c.fillStyle = '#f2a600'; c.beginPath(); c.arc(cx * u, cy * u, 0.22 * u, 0, 7); c.fill(); }
      if (!this.historyOwner && this.occupied.has(i)) { c.strokeStyle = 'rgba(0,0,0,.55)'; c.lineWidth = Math.max(1, u * 0.16); c.beginPath(); c.moveTo((cx - 0.5) * u, (cy + 0.5) * u); c.lineTo((cx + 0.5) * u, (cy - 0.5) * u); c.stroke(); }
    }
    // Fleuves, côtes et frontières.
    c.lineCap = 'round';
    const seg = (cx: number, cy: number, e: number[]) => { c.moveTo((cx + CORNER[e[0]][0]) * u, (cy + CORNER[e[0]][1]) * u); c.lineTo((cx + CORNER[e[1]][0]) * u, (cy + CORNER[e[1]][1]) * u); };
    const pass = (style: string, width: number, test: (o: number, p: number, i: number, j: number) => boolean) => {
      c.strokeStyle = style; c.lineWidth = width; c.beginPath();
      for (let i = 0; i < n; i++) {
        if (m.terrain[i] === 0) continue;
        const [cx, cy] = this.center(i);
        for (let k = 0; k < 6; k++) { const j = this.nb[i * 6 + k]; if (j >= 0 && test(owner[i], owner[j], i, j)) seg(cx, cy, EDGE[k]); }
      }
      c.stroke();
    };
    pass('rgba(8,14,22,.55)', Math.max(1, u * 0.1), (o, p, i, j) => m.terrain[j] === 0);
    pass('rgba(10,12,16,.85)', Math.max(1.5, u * 0.2), (o, p, i, j) => m.terrain[j] !== 0 && o !== p);
    const hostile = new Set<string>();
    for (const w of this.wars) for (const a of w.attackers) for (const d of w.defenders) { hostile.add(`${a}:${d}`); hostile.add(`${d}:${a}`); }
    if (hostile.size && !this.historyOwner) pass('#ec4647', Math.max(2, u * 0.32), (o, p) => o >= 0 && p >= 0 && hostile.has(`${o}:${p}`));
    if (this.selected !== null) pass('#ffffff', Math.max(2, u * 0.26), (o, p) => o === this.selected && p !== o);
    this.baseDirty = false;
    this.dirty = true;
  }

  private draw(): void {
    if (this.baseDirty) this.renderBase();
    this.dirty = false;
    const { ctx, canvas } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = OCEAN;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!this.map) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = this.quality > 1 ? 'high' : 'low';
    ctx.drawImage(this.base, this.tx, this.ty, (this.base.width / this.unit) * this.k, (this.base.height / this.unit) * this.k);
    const dpr = canvas.width / canvas.getBoundingClientRect().width;
    // Capitales et noms : seulement pour les nations assez grandes à l'écran.
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [id, ct] of this.centroids) {
      const nat = this.nations[id];
      if (!nat) continue;
      const size = Math.sqrt(ct.n) * this.k;
      const x = (ct.x / ct.n) * this.k + this.tx; const y = (ct.y / ct.n) * this.k + this.ty;
      if (x < -100 || y < -50 || x > canvas.width + 100 || y > canvas.height + 50) continue;
      if (!this.historyOwner && nat.alive && size > 34 * dpr) {
        const [cx, cy] = this.center(nat.capitalCell);
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5 * dpr;
        ctx.beginPath(); ctx.arc(cx * this.k + this.tx, cy * this.k + this.ty, 2.6 * dpr, 0, 7); ctx.fill(); ctx.stroke();
      }
      if (size < 46 * dpr) continue;
      const font = Math.max(10 * dpr, Math.min(20 * dpr, size / 5.5));
      ctx.font = `600 ${font}px system-ui, sans-serif`;
      ctx.lineWidth = 3 * dpr; ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.fillStyle = '#fff';
      const label = nat.atWar && !this.historyOwner ? `⚔ ${nat.name}` : nat.name;
      ctx.strokeText(label, x, y); ctx.fillText(label, x, y);
    }
  }
}
