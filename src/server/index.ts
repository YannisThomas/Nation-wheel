// Serveur local : sert l'interface et héberge la simulation. Aucune donnée ne
// quitte la machine ; le seul appel sortant vise le runtime LLM local.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_DECISION_CONFIG } from '../agents/director';
import { DEFAULT_APP_CONFIG, mergeConfig, parseYaml, type AppConfig } from '../config';
import { SimHost, type Command } from '../host/simhost';
import { callsPerTick, setupLlm } from './llm-setup';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };

export function loadConfig(path = join(ROOT, 'config.yaml')): { config: AppConfig; warnings: string[] } {
  if (!existsSync(path)) return { config: JSON.parse(JSON.stringify(DEFAULT_APP_CONFIG)), warnings: [] };
  return mergeConfig(parseYaml(readFileSync(path, 'utf8')));
}

const safeName = (s: unknown) => (typeof s === 'string' && /^[\w\- àâäéèêëîïôöùûüç]{1,60}$/i.test(s) ? s.trim() : null);

export interface ServerHandle { host: SimHost; port: number; close(): Promise<void>; report: string[] }

export async function startServer(cfg: AppConfig, opts: { savesDir?: string; webDir?: string; port?: number; llmTest?: boolean } = {}): Promise<ServerHandle> {
  const savesDir = opts.savesDir ?? join(ROOT, 'saves');
  const webDir = opts.webDir ?? join(ROOT, 'web', 'dist');
  mkdirSync(savesDir, { recursive: true });

  const llm = await setupLlm(cfg, { test: opts.llmTest });
  const s = cfg.simulation;
  const host = new SimHost(
    { nations: s.nations, seed: s.seed, width: s.map_width, height: s.map_height, startYear: s.start_year, roster: s.roster === 'season1' ? 'season1' : 'random' },
    { ...DEFAULT_DECISION_CONFIG, strategicThreshold: cfg.decision.strategic_threshold, nationalThreshold: cfg.decision.national_threshold, fastThreshold: cfg.decision.fast_threshold, maxLlmCallsPerTick: callsPerTick(cfg, llm.plan) },
  );
  host.llmEnabled = cfg.llm.enabled;
  host.setChooser(llm.chooser, { runtime: llm.provider?.name ?? 'aucun', models: llm.chooser ? [...new Set([llm.plan.fast, llm.plan.national, llm.plan.strategic])].join(', ') : '' });

  const streams = new Set<ServerResponse>();
  host.onMessage((msg) => { const data = `data: ${JSON.stringify(msg)}\n\n`; for (const res of streams) res.write(data); });

  const json = (res: ServerResponse, status: number, body: unknown) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
  const readBody = (req: IncomingMessage) => new Promise<string>((ok, ko) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 200e6) { ko(new Error('requête trop volumineuse')); req.destroy(); } });
    req.on('end', () => ok(raw));
    req.on('error', ko);
  });

  async function command(body: Record<string, unknown>): Promise<unknown> {
    switch (body.type) {
      case 'saves': return readdirSync(savesDir).filter((f) => f.endsWith('.json')).map((f) => ({ name: f.slice(0, -5), time: statSync(join(savesDir, f)).mtimeMs, size: statSync(join(savesDir, f)).size })).sort((a, b) => b.time - a.time);
      case 'save': { const name = safeName(body.name); if (!name) throw new Error('Nom de sauvegarde invalide'); writeFileSync(join(savesDir, `${name}.json`), JSON.stringify(host.exportSave())); return true; }
      case 'load': { const name = safeName(body.name); if (!name || !existsSync(join(savesDir, `${name}.json`))) throw new Error('Sauvegarde introuvable'); return host.handle({ type: 'import', data: readFileSync(join(savesDir, `${name}.json`), 'utf8') }); }
      case 'delete_save': { const name = safeName(body.name); if (!name || !existsSync(join(savesDir, `${name}.json`))) throw new Error('Sauvegarde introuvable'); unlinkSync(join(savesDir, `${name}.json`)); return true; }
      case 'about': return { mode: 'server', report: llm.report, hardware: llm.hardware, plan: llm.plan };
      default: return host.handle(body as unknown as Command);
    }
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname === '/api/events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write(`data: ${JSON.stringify(host.init())}\n\n`);
        streams.add(res);
        req.on('close', () => streams.delete(res));
        return;
      }
      if (url.pathname === '/api/cmd' && req.method === 'POST') {
        try { return json(res, 200, { ok: true, result: await command(JSON.parse(await readBody(req))) }); }
        catch (e) { return json(res, 400, { ok: false, error: e instanceof Error ? e.message : String(e) }); }
      }
      // Fichiers de l'interface.
      const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '') || 'index.html';
      const file = join(webDir, rel);
      if (!file.startsWith(webDir) || !existsSync(file) || !statSync(file).isFile()) {
        if (!existsSync(join(webDir, 'index.html'))) { res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Interface non construite. Lancez « npm run build ».'); }
        res.writeHead(404); return res.end('Introuvable');
      }
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(readFileSync(file));
    } catch (e) {
      res.writeHead(500); res.end(String(e));
    }
  });
  const port = opts.port ?? cfg.server.port;
  await new Promise<void>((ok) => server.listen(port, cfg.server.lan ? '0.0.0.0' : '127.0.0.1', ok));
  const actual = (server.address() as { port: number }).port;
  return {
    host, port: actual, report: llm.report,
    close: () => new Promise<void>((ok) => { host.stop(); for (const r of streams) r.end(); server.close(() => ok()); server.closeAllConnections?.(); }),
  };
}

// Lancement direct : npm start [-- --lan] [--port N]
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { config, warnings } = loadConfig();
  if (process.argv.includes('--lan')) config.server.lan = true;
  const p = process.argv.indexOf('--port');
  if (p > 0) config.server.port = Number(process.argv[p + 1]) || config.server.port;
  for (const w of warnings) console.warn(`Configuration : ${w}`);
  startServer(config).then((h) => {
    for (const line of h.report) console.log(line);
    console.log(`\nSimulateur prêt : http://localhost:${h.port}`);
    if (config.server.lan) {
      for (const list of Object.values(networkInterfaces())) for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) console.log(`Depuis un téléphone sur le même réseau : http://${a.address}:${h.port}`);
    } else console.log('Pour y accéder depuis un téléphone du même réseau : npm start -- --lan');
  });
}
