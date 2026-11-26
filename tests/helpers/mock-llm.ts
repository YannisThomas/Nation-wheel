// Faux runtime LLM local pour les tests : parle à la fois l'API Ollama et
// l'API compatible OpenAI. Aucun modèle réel n'est exécuté.

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export type Mode = 'good' | 'garbage' | 'wrapped' | 'tools' | 'slow' | 'flaky' | 'cheat';

export interface MockLlm {
  url: string;
  mode: Mode;
  requests: { path: string; body: any }[];
  close(): Promise<void>;
}

type Schema = { properties: { action: { enum: string[] }; target: { anyOf?: { enum?: string[] }[] } } };

/** Lit dans le contexte la première option correspondant à l'action choisie. */
function decide(schema: Schema, prompt: string, pickLast = false): string {
  const actions = schema.properties.action.enum;
  const lines = prompt.split('\n').filter((l) => /^\d+\. action="/.test(l));
  const line = lines[pickLast ? lines.length - 1 : 0] ?? '';
  const action = /action="([^"]+)"/.exec(line)?.[1] ?? actions[0];
  const target = /target="([^"]+)"/.exec(line)?.[1] ?? null;
  return JSON.stringify({ action, target, priority: 0.7, key_factors: ['Facteur simulé', 'Second facteur'] });
}

export async function startMockLlm(mode: Mode = 'good'): Promise<MockLlm> {
  const state: MockLlm = { url: '', mode, requests: [], close: async () => {} };
  let flaky = 0;
  const server: Server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', async () => {
      const path = req.url ?? '';
      const body = raw ? JSON.parse(raw) : {};
      state.requests.push({ path, body });
      const send = (obj: unknown, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
      if (path === '/api/tags') return send({ models: [{ name: 'qwen3.5:4b' }, { name: 'qwen3.5:9b' }] });
      if (path === '/v1/models') return send({ data: [{ id: 'local-model' }] });
      if (path === '/api/pull') return send({ status: 'success' });

      const ollama = path === '/api/chat';
      if (!ollama && path !== '/v1/chat/completions') return send({ error: 'not found' }, 404);
      const schema: Schema | undefined = ollama ? body.format : body.response_format?.json_schema?.schema;
      const tools: any[] = body.tools ?? [];
      const prompt: string = body.messages.filter((m: any) => m.role === 'user').map((m: any) => m.content).join('\n');
      const toolResults = body.messages.filter((m: any) => m.role === 'tool').length;
      const reply = (content: string, calls: { name: string; arguments: object }[] = []) => send(ollama
        ? { message: { role: 'assistant', content, tool_calls: calls.map((c) => ({ function: c })) } }
        : { choices: [{ message: { role: 'assistant', content, tool_calls: calls.map((c, i) => ({ id: `c${i}`, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.arguments) } })) } }] });

      if (state.mode === 'slow') await new Promise((r) => setTimeout(r, 400));
      if (state.mode === 'flaky' && flaky++ % 2 === 0) return send({ error: 'model crashed' }, 500);
      if (state.mode === 'garbage') return reply('Je pense que nous devrions attaquer tout le monde !');
      if (state.mode === 'cheat') return reply(JSON.stringify({ action: 'declare_victory', target: null, priority: 1, key_factors: ['J\'ai gagné la guerre'] }));

      const proposeTool = tools.find((t) => t.function.name === 'propose_action');
      const effective: Schema | undefined = schema ?? proposeTool?.function.parameters;
      if (!effective) return reply('{}');
      if (state.mode === 'tools' && tools.length) {
        if (toolResults === 0) return reply('', [{ name: 'get_economy', arguments: {} }, { name: 'get_war', arguments: {} }]);
        return reply('', [{ name: 'propose_action', arguments: JSON.parse(decide(effective, prompt)) }]);
      }
      if (tools.length && !schema) return reply(decide(effective, prompt));
      if (state.mode === 'wrapped') return reply(`<think>Réfléchissons…</think>\nVoici ma décision :\n\`\`\`json\n${decide(effective, prompt)}\n\`\`\``);
      return reply(decide(effective, prompt));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  state.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  state.close = () => new Promise<void>((r) => server.close(() => r()));
  return state;
}
