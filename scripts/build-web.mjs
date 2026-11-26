// Construit l'interface dans web/dist : npm run build
import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';

mkdirSync('web/dist', { recursive: true });
await build({
  entryPoints: { app: 'web/src/main.ts', worker: 'web/src/worker.ts' },
  bundle: true, format: 'iife', target: 'es2020', minify: true, sourcemap: false, outdir: 'web/dist', logLevel: 'warning',
});
for (const f of ['index.html', 'style.css', 'manifest.webmanifest', 'icon.svg', 'sw.js']) cpSync(`web/${f}`, `web/dist/${f}`);
console.log('Interface construite dans web/dist');
