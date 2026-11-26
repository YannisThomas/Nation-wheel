// Graphique en ligne à une série : trait de 2 px, grille discrète, réticule
// et valeur au toucher. Une série = pas de légende, le titre la nomme.

export interface Point { x: number; y: number }

const store = new WeakMap<HTMLCanvasElement, { pts: Point[]; fmt: (v: number) => string; xfmt: (v: number) => string; hover: number | null }>();

export function lineChart(canvas: HTMLCanvasElement, pts: Point[], fmt: (v: number) => string, xfmt: (v: number) => string): void {
  const first = !store.has(canvas);
  const prev = store.get(canvas);
  store.set(canvas, { pts, fmt, xfmt, hover: prev?.hover ?? null });
  if (first) {
    const at = (e: PointerEvent) => { const s = store.get(canvas)!; const r = canvas.getBoundingClientRect(); s.hover = (e.clientX - r.left) / r.width; paint(canvas); };
    canvas.addEventListener('pointerdown', at);
    canvas.addEventListener('pointermove', at);
    canvas.addEventListener('pointerleave', () => { store.get(canvas)!.hover = null; paint(canvas); });
    canvas.style.touchAction = 'pan-y';
  }
  paint(canvas);
}

function paint(canvas: HTMLCanvasElement): void {
  const s = store.get(canvas)!;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const r = canvas.getBoundingClientRect();
  if (!r.width) return;
  canvas.width = r.width * dpr; canvas.height = r.height * dpr;
  const c = canvas.getContext('2d')!;
  c.scale(dpr, dpr);
  const css = getComputedStyle(canvas);
  const ink = css.getPropertyValue('--text-2') || '#9c9c9c';
  const grid = css.getPropertyValue('--line') || '#333';
  const series = css.getPropertyValue('--series') || '#338ced';
  const W = r.width; const H = r.height;
  const L = 6; const R = 6; const T = 18; const B = 18;
  c.font = '11px system-ui, sans-serif';
  if (s.pts.length < 2) { c.fillStyle = ink; c.textAlign = 'center'; c.fillText('Pas encore assez de données', W / 2, H / 2); return; }
  const xs = s.pts.map((p) => p.x); const ys = s.pts.map((p) => p.y);
  const x0 = Math.min(...xs); const x1 = Math.max(...xs);
  let y0 = Math.min(...ys); let y1 = Math.max(...ys);
  if (y1 - y0 < 1e-9) { y1 += 1; y0 -= 1; }
  const pad = (y1 - y0) * 0.08; y0 -= pad; y1 += pad;
  const X = (x: number) => L + ((x - x0) / (x1 - x0)) * (W - L - R);
  const Y = (y: number) => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
  c.strokeStyle = grid; c.lineWidth = 1; c.beginPath();
  for (let i = 0; i <= 2; i++) { const y = T + (i / 2) * (H - T - B); c.moveTo(L, y); c.lineTo(W - R, y); }
  c.stroke();
  c.strokeStyle = series; c.lineWidth = 2; c.lineJoin = 'round'; c.beginPath();
  s.pts.forEach((p, i) => (i ? c.lineTo(X(p.x), Y(p.y)) : c.moveTo(X(p.x), Y(p.y))));
  c.stroke();
  c.fillStyle = ink; c.textBaseline = 'top';
  c.textAlign = 'left'; c.fillText(s.xfmt(x0), L, H - 14);
  c.textAlign = 'right'; c.fillText(s.xfmt(x1), W - R, H - 14);
  // Valeur affichée : le point touché, sinon le dernier.
  let i = s.pts.length - 1;
  if (s.hover !== null) {
    const target = x0 + Math.max(0, Math.min(1, (s.hover * W - L) / (W - L - R))) * (x1 - x0);
    i = s.pts.reduce((best, p, j) => (Math.abs(p.x - target) < Math.abs(s.pts[best].x - target) ? j : best), 0);
    c.strokeStyle = ink; c.lineWidth = 1; c.beginPath(); c.moveTo(X(s.pts[i].x), T); c.lineTo(X(s.pts[i].x), H - B); c.stroke();
  }
  const p = s.pts[i];
  c.fillStyle = series; c.beginPath(); c.arc(X(p.x), Y(p.y), 4, 0, 7); c.fill();
  c.fillStyle = css.getPropertyValue('--text') || '#efefef';
  c.textBaseline = 'top'; c.textAlign = X(p.x) > W / 2 ? 'right' : 'left';
  c.font = '600 12px system-ui, sans-serif';
  c.fillText(`${s.fmt(p.y)} · ${s.xfmt(p.x)}`, X(p.x) > W / 2 ? W - R : L, 2);
}
