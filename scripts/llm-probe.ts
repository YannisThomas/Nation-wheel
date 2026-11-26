// Sonde : fait décider de vraies nations par le vrai runtime, avec mesures.
import { Director } from '../src/agents/director';
import { buildContext, decisionSchema, SYSTEM_PROMPT } from '../src/agents/context';
import { createWorld, step } from '../src/engine/sim';
import { LlmChooser } from '../src/llm/chooser';
import { OllamaProvider } from '../src/llm/provider';

const [fast = 'qwen3.5:4b', strategic = 'qwen3.5:9b', n = '4'] = process.argv.slice(2);
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: string, init?: RequestInit) => {
  const t0 = Date.now();
  const res = await realFetch(url, init);
  if (String(url).endsWith('/api/chat')) {
    const j = await res.clone().json() as Record<string, any>;
    const req = JSON.parse(String(init?.body));
    console.log(`   [chat ${req.model} ${req.tools ? 'tools' : 'schema'}] ${Date.now() - t0} ms, load ${Math.round((j.load_duration ?? 0) / 1e6)} ms, prompt ${j.prompt_eval_count} tok, out ${j.eval_count} tok, calls=${(j.message?.tool_calls ?? []).map((c: any) => c.function.name).join(',')} content=${JSON.stringify((j.message?.content ?? '').slice(0, 160))}`);
  }
  return res;
}) as typeof fetch;

const world = createWorld({ nations: 30, seed: 3 });
const director = new Director();
for (let i = 0; i < 60; i++) { const { actions } = director.decideSync(world); director.attachResults(step(world, actions)); }
const tasks = director.plan(world).sort((a, b) => b.importance - a.importance).slice(0, Number(n));
const chooser = new LlmChooser(new OllamaProvider(), { models: { fast, national: fast, strategic }, useTools: true, maxToolRounds: 2, timeoutMs: 120000 });
let i = 0;
for (const t of tasks) {
  const tier = (['strategic', 'national', 'fast'] as const)[i++ % 3];
  const options = t.ranked.map((r) => r.option);
  console.log(`\n${t.nation.name} — ${tier} — ${options.length} options`);
  const t0 = Date.now();
  try {
    const c = await chooser.choose(world, { ...t, tier }, { system: SYSTEM_PROMPT, context: buildContext(world, t.nation, t.sit, options), schema: decisionSchema(world, options) });
    console.log(`=> ${Date.now() - t0} ms`, JSON.stringify(c));
  } catch (e) { console.log(`=> ÉCHEC ${Date.now() - t0} ms`, (e as Error).message); }
}
