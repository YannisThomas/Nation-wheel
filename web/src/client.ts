// Lien entre l'interface et l'hôte de simulation. Deux modes, même API :
// serveur local (PC ou serveur personnel) ou Web Worker (téléphone autonome).

import type { InitMsg, StateMsg } from '../../src/host/simhost';

export type Msg = InitMsg | StateMsg;
export interface SaveInfo { name: string; time: number }
export interface Client {
  mode: 'server' | 'local';
  onMessage(cb: (m: Msg) => void): void;
  cmd<T = unknown>(c: object): Promise<T>;
  saves(): Promise<SaveInfo[]>;
  save(name: string): Promise<void>;
  load(name: string): Promise<void>;
  remove(name: string): Promise<void>;
  about(): Promise<{ report: string[] }>;
}

class RemoteClient implements Client {
  mode = 'server' as const;
  private cb: (m: Msg) => void = () => {};
  constructor() {
    const es = new EventSource('/api/events');
    es.onmessage = (e) => this.cb(JSON.parse(e.data));
  }
  onMessage(cb: (m: Msg) => void) { this.cb = cb; }
  async cmd<T>(c: object): Promise<T> {
    const r = await (await fetch('/api/cmd', { method: 'POST', body: JSON.stringify(c) })).json();
    if (!r.ok) throw new Error(r.error);
    return r.result as T;
  }
  saves() { return this.cmd<SaveInfo[]>({ type: 'saves' }); }
  async save(name: string) { await this.cmd({ type: 'save', name }); }
  async load(name: string) { await this.cmd({ type: 'load', name }); }
  async remove(name: string) { await this.cmd({ type: 'delete_save', name }); }
  about() { return this.cmd<{ report: string[] }>({ type: 'about' }); }
}

function idb(): Promise<IDBDatabase> {
  return new Promise((ok, ko) => {
    const req = indexedDB.open('nation-wheel', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('saves');
    req.onsuccess = () => ok(req.result);
    req.onerror = () => ko(req.error);
  });
}
async function store<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await idb();
  return new Promise((ok, ko) => { const r = fn(db.transaction('saves', mode).objectStore('saves')); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
}

class WorkerClient implements Client {
  mode = 'local' as const;
  private cb: (m: Msg) => void = () => {};
  private worker = new Worker('worker.js');
  private waiting = new Map<number, { ok: (v: unknown) => void; ko: (e: Error) => void }>();
  private next = 1;
  constructor() {
    this.worker.onmessage = (e) => {
      const d = e.data;
      if (d.push) return this.cb(d.push);
      const w = this.waiting.get(d.id);
      this.waiting.delete(d.id);
      if (w) d.ok ? w.ok(d.result) : w.ko(new Error(d.error));
    };
  }
  onMessage(cb: (m: Msg) => void) { this.cb = cb; this.cmd<Msg>({ type: 'init' }).then(cb); }
  cmd<T>(c: object): Promise<T> {
    return new Promise((ok, ko) => { const id = this.next++; this.waiting.set(id, { ok: ok as (v: unknown) => void, ko }); this.worker.postMessage({ id, cmd: c }); });
  }
  async saves() {
    const keys = await store('readonly', (s) => s.getAllKeys());
    const out: SaveInfo[] = [];
    for (const k of keys) out.push({ name: String(k), time: (await store<{ time: number }>('readonly', (s) => s.get(k))).time });
    return out.sort((a, b) => b.time - a.time);
  }
  async save(name: string) { const data = await this.cmd<string>({ type: 'export' }); await store('readwrite', (s) => s.put({ time: Date.now(), data }, name)); }
  async load(name: string) { const v = await store<{ data: string } | undefined>('readonly', (s) => s.get(name)); if (!v) throw new Error('Sauvegarde introuvable'); await this.cmd({ type: 'import', data: v.data }); }
  async remove(name: string) { await store('readwrite', (s) => s.delete(name)); }
  async about() { return { report: ['Mode autonome : la simulation tourne dans ce navigateur, sans serveur.', 'Les nations décident avec le moteur comportemental. Un LLM du réseau local peut être branché dans les paramètres.'] }; }
}

/** Serveur local s'il répond, sinon simulation dans le navigateur. */
export async function connect(): Promise<Client> {
  if (!new URLSearchParams(location.search).has('local')) {
    try {
      const r = await fetch('/api/cmd', { method: 'POST', body: JSON.stringify({ type: 'about' }) });
      if (r.ok && (await r.json()).ok) return new RemoteClient();
    } catch { /* pas de serveur : mode autonome */ }
  }
  return new WorkerClient();
}
