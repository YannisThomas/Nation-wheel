import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_APP_CONFIG, mergeConfig, parseYaml, type AppConfig } from '../../src/config';
import { adminCommand } from '../../src/engine/admin';
import { getRel } from '../../src/engine/diplomacy';
import { exactHash } from '../../src/engine/hash';
import { createWorld, step } from '../../src/engine/sim';
import { warBetween } from '../../src/engine/war';
import { SimHost, type InitMsg, type StateMsg } from '../../src/host/simhost';
import { startServer, type ServerHandle } from '../../src/server/index';
import { startMockLlm, type MockLlm } from '../helpers/mock-llm';

const small = { width: 80, height: 45, nations: 16, seed: 3 };
const cfg = (over: Partial<AppConfig['llm']> = {}): AppConfig => {
  const c = JSON.parse(JSON.stringify(DEFAULT_APP_CONFIG)) as AppConfig;
  Object.assign(c.simulation, { nations: 16, map_width: 80, map_height: 45 });
  Object.assign(c.llm, { enabled: false }, over);
  return c;
};

describe('configuration', () => {
  it('lit le YAML, garde les valeurs par défaut et signale les erreurs', () => {
    const { config, warnings } = mergeConfig(parseYaml(`
# commentaire
simulation:
  nations: 120     # en fin de ligne
  seed: 42
llm:
  enabled: false
  model: "qwen3.5:9b"
  inconnu: 1
decision:
  strategic_threshold: haut
autre:
  x: 1
`));
    expect(config.simulation.nations).toBe(120);
    expect(config.simulation.seed).toBe(42);
    expect(config.llm.enabled).toBe(false);
    expect(config.llm.model).toBe('qwen3.5:9b');
    expect(config.llm.runtime).toBe('auto');
    expect(config.decision.strategic_threshold).toBe(0.8);
    expect(warnings.length).toBe(3);
    expect(() => parseYaml('ceci n\'est pas du yaml')).toThrow();
    expect(mergeConfig(parseYaml('simulation:\n  nations: 99999')).config.simulation.nations).toBe(500);
  });
});

describe('mode administrateur', () => {
  it('chaque intervention est appliquée, bornée et inscrite au journal', () => {
    const w = createWorld(small);
    const a = w.nations[0];
    const b = w.nations.find((n) => n.id !== 0 && a.geo.neighbors[n.id] === undefined) ?? w.nations[1];
    const admin = () => w.journal.filter((e) => e.admin).length;
    expect(adminCommand(w, { op: 'edit_nation', nation: 0, patch: { name: 'Utopia', government: 'republic', stability: 500, tech: 60 } })).toBeNull();
    expect([a.name, a.government, a.stability, a.tech]).toEqual(['Utopia', 'republic', 100, 60]);
    expect(adminCommand(w, { op: 'edit_nation', nation: 0, patch: { government: 'anarchie' } })).toMatch(/refusé/);
    expect(adminCommand(w, { op: 'edit_nation', nation: 0, patch: { mind: 1 } as never })).toMatch(/refusé/);
    expect(adminCommand(w, { op: 'force_war', a: 0, b: b.id })).toBeNull();
    expect(warBetween(w, 0, b.id)).toBeDefined();
    expect(adminCommand(w, { op: 'force_war', a: 0, b: b.id })).toMatch(/déjà/);
    expect(adminCommand(w, { op: 'force_peace', war: w.wars[0].id })).toBeNull();
    expect(w.wars.length).toBe(0);
    expect(adminCommand(w, { op: 'force_treaty', a: 0, b: b.id, kind: 'defense_pact' })).toBeNull();
    expect(getRel(w, 0, b.id).defense_pact).toBeGreaterThanOrEqual(0);
    expect(adminCommand(w, { op: 'set_opinion', a: 0, b: b.id, opinion: -500 })).toBeNull();
    expect(getRel(w, 0, b.id).opinion).toBe(-100);
    const stab = a.stability;
    expect(adminCommand(w, { op: 'event', nation: 0, kind: 'unrest' })).toBeNull();
    expect(a.stability).toBe(stab - 20);
    const land = w.map.owner.findIndex((o, i) => o === b.id && i !== b.capitalCell);
    const before = [a.geo.cells, b.geo.cells];
    expect(adminCommand(w, { op: 'set_cells', cells: [land, -5, 1e9], owner: 0 })).toBeNull();
    expect(w.map.owner[land]).toBe(0);
    step(w);
    expect([a.geo.cells, b.geo.cells]).toEqual([before[0] + 1, before[1] - 1]);
    expect(adminCommand(w, { op: 'set_resource', cell: land, resource: 0 })).toBeNull();
    expect(w.map.resource[land]).toBe(0);
    expect(adminCommand(w, { op: 'set_resource', cell: land, resource: 99 })).toMatch(/invalide/);
    expect(adminCommand(w, { op: 'nuke' } as never)).toMatch(/inconnue/);
    expect(admin()).toBe(8);
    for (let i = 0; i < 24; i++) step(w); // le monde reste cohérent après les interventions
    expect(Number.isFinite(a.gdp)).toBe(true);
  });
});

describe('hôte de simulation', () => {
  it('diffuse l\'état, répond aux commandes et sélectionne une nation', async () => {
    const host = new SimHost(small);
    const msgs: (StateMsg | InitMsg)[] = [];
    host.onMessage((m) => msgs.push(m));
    const init = (await host.handle({ type: 'init' })) as InitMsg;
    expect(init.map.owner.length).toBe(80 * 45);
    expect(init.state.infos.length).toBe(16);
    await host.handle({ type: 'select', nation: 2 });
    for (let i = 0; i < 30; i++) await host.handle({ type: 'step' });
    const last = msgs[msgs.length - 1] as StateMsg;
    expect(last.tick).toBe(30);
    expect(last.rows.length).toBe(16);
    expect(last.selected!.id).toBe(2);
    expect(last.selected!.background.length).toBeGreaterThan(3);
    expect(last.selected!.prefs.science).toBeGreaterThanOrEqual(0);
    expect(last.selected).not.toHaveProperty('mind');
    expect(last.llm.available).toBe(false);
    const decisions = (await host.handle({ type: 'decisions' })) as { id: number; label: string }[];
    expect(decisions.length).toBeGreaterThan(0);
    expect(await host.handle({ type: 'decision', id: decisions[0].id })).toMatchObject({ id: decisions[0].id });
    expect(((await host.handle({ type: 'series' })) as unknown[]).length).toBeGreaterThanOrEqual(3);
    expect(((await host.handle({ type: 'journal', limit: 5 })) as unknown[]).length).toBeLessThanOrEqual(5);
    expect(await host.handle({ type: 'admin', command: { op: 'event', nation: 0, kind: 'boom' } })).toEqual({ ok: true, error: null });
    expect(await host.handle({ type: 'admin', command: { op: 'event', nation: 999, kind: 'boom' } })).toMatchObject({ ok: false });
    await expect(host.handle({ type: 'explode' } as never)).rejects.toThrow();
    host.stop();
  });

  it('ne renvoie que les changements de frontières entre deux messages', async () => {
    const host = new SimHost(small);
    const msgs: StateMsg[] = [];
    host.onMessage((m) => { if (m.type === 'state') msgs.push(m); });
    await host.handle({ type: 'step' });
    const cell = host.world.map.owner.findIndex((o) => o === 1 && host.world.nations[1].capitalCell !== 0);
    await host.handle({ type: 'admin', command: { op: 'set_cells', cells: [cell], owner: 0 } });
    expect(msgs[msgs.length - 1].ownerDiff).toEqual([cell, 0]);
    await host.handle({ type: 'step' });
    expect(msgs[msgs.length - 1].ownerDiff.includes(cell)).toBe(false);
    host.stop();
  });

  it('tourne en continu puis se met en pause', async () => {
    const host = new SimHost(small);
    await host.handle({ type: 'speed', value: 1000 });
    await host.handle({ type: 'play' });
    await new Promise((r) => setTimeout(r, 300));
    await host.handle({ type: 'pause' });
    const t = host.world.tick;
    expect(t).toBeGreaterThan(20);
    await new Promise((r) => setTimeout(r, 80));
    expect(host.world.tick).toBeLessThanOrEqual(t + 25);
    host.stop();
  });

  it('exporte et réimporte une partie à l\'identique, historique compris', async () => {
    const a = new SimHost(small);
    for (let i = 0; i < 130; i++) await a.tick();
    const data = (await a.handle({ type: 'export' })) as string;
    const b = new SimHost({ ...small, seed: 99 });
    await b.handle({ type: 'import', data });
    expect(exactHash(b.world)).toBe(exactHash(a.world));
    expect(await b.handle({ type: 'history' })).toEqual(await a.handle({ type: 'history' }));
    for (let i = 0; i < 40; i++) { await a.tick(); await b.tick(); }
    expect(exactHash(b.world)).toBe(exactHash(a.world));
    await expect(b.handle({ type: 'import', data: '{"format":"autre"}' })).rejects.toThrow(/non reconnu/);
    await expect(b.handle({ type: 'import', data: 'pas du json' })).rejects.toThrow();
    a.stop(); b.stop();
  });

  it('nouveau monde : repart de zéro avec la configuration demandée', async () => {
    const host = new SimHost(small);
    for (let i = 0; i < 10; i++) await host.tick();
    let init: InitMsg | null = null;
    host.onMessage((m) => { if (m.type === 'init') init = m; });
    await host.handle({ type: 'new', config: { ...small, nations: 8, seed: 5 } });
    expect(host.world.tick).toBe(0);
    expect(host.world.nations.length).toBe(8);
    expect(init!.state.infos.length).toBe(8);
    host.stop();
  });
});

describe('serveur local', () => {
  let server: ServerHandle | null = null;
  let mock: MockLlm | null = null;
  let dir = '';
  afterEach(async () => { await server?.close(); await mock?.close(); server = null; mock = null; if (dir) rmSync(dir, { recursive: true, force: true }); });
  const cmd = async (body: object) => (await fetch(`http://127.0.0.1:${server!.port}/api/cmd`, { method: 'POST', body: JSON.stringify(body) })).json() as Promise<{ ok: boolean; result?: any; error?: string }>;

  it('commandes, sauvegardes sur disque et flux d\'événements', async () => {
    dir = mkdtempSync(join(tmpdir(), 'nw-'));
    server = await startServer(cfg(), { savesDir: dir, port: 0, webDir: dir });
    expect(server.report.join(' ')).toMatch(/désactivé/);
    for (let i = 0; i < 12; i++) await cmd({ type: 'step' });
    expect((await cmd({ type: 'save', name: 'partie 1' })).ok).toBe(true);
    expect((await cmd({ type: 'save', name: '../../etc/passwd' })).ok).toBe(false);
    const hash = exactHash(server.host.world);
    for (let i = 0; i < 5; i++) await cmd({ type: 'step' });
    expect((await cmd({ type: 'saves' })).result.map((s: { name: string }) => s.name)).toEqual(['partie 1']);
    expect((await cmd({ type: 'load', name: 'partie 1' })).ok).toBe(true);
    expect(exactHash(server.host.world)).toBe(hash);
    expect((await cmd({ type: 'load', name: 'absente' })).ok).toBe(false);
    expect((await cmd({ type: 'delete_save', name: 'partie 1' })).ok).toBe(true);
    expect((await cmd({ type: 'explode' })).ok).toBe(false);

    const res = await fetch(`http://127.0.0.1:${server.port}/api/events`);
    const reader = res.body!.getReader();
    let text = '';
    while (!text.includes('\n\n')) text += new TextDecoder().decode((await reader.read()).value);
    expect(JSON.parse(text.slice(6, text.indexOf('\n\n'))).type).toBe('init');
    await reader.cancel();
    expect((await fetch(`http://127.0.0.1:${server.port}/..%2f..%2fpackage.json`)).status).not.toBe(200);
  });

  it('détecte un runtime LLM, vérifie le modèle et l\'utilise', async () => {
    mock = await startMockLlm('good');
    dir = mkdtempSync(join(tmpdir(), 'nw-'));
    server = await startServer(cfg({ enabled: true, runtime: 'ollama', base_url: mock.url, tools: false }), { savesDir: dir, port: 0, webDir: dir });
    expect(server.report.join(' ')).toMatch(/Auto-test réussi/);
    for (let i = 0; i < 80; i++) await cmd({ type: 'step' });
    expect(server.host.director.stats.llm).toBeGreaterThan(0);
    await cmd({ type: 'llm', enabled: false });
    const before = server.host.director.stats.llm;
    for (let i = 0; i < 30; i++) await cmd({ type: 'step' });
    expect(server.host.director.stats.llm).toBe(before);
  });

  it('runtime injoignable ou modèle défaillant : démarre quand même, sans LLM', async () => {
    dir = mkdtempSync(join(tmpdir(), 'nw-'));
    server = await startServer(cfg({ enabled: true, runtime: 'ollama', base_url: 'http://127.0.0.1:9' }), { savesDir: dir, port: 0, webDir: dir });
    expect(server.report.join(' ')).toMatch(/Aucun runtime/);
    expect((await cmd({ type: 'step' })).ok).toBe(true);
    await server.close();
    mock = await startMockLlm('garbage');
    server = await startServer(cfg({ enabled: true, runtime: 'ollama', base_url: mock.url }), { savesDir: dir, port: 0, webDir: dir });
    expect(server.report.join(' ')).toMatch(/Auto-test .* échoué/);
    expect(server.host.director.chooser).toBeNull();
  });
});
