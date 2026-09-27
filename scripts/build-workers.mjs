// Bundles the two operational workers into self-contained Node modules for the
// production image (docker/Dockerfile.security, `workers` target). The image then
// needs neither the repository checkout nor `node_modules`, as the deployment ADR
// requires. Usage: node scripts/build-workers.mjs [outdir]  (default dist/workers)
import { createHash } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outdir = path.resolve(root, process.argv[2] ?? 'dist/workers');
if (path.relative(root, outdir).startsWith('..')) {
  throw new Error('The output directory must stay inside the repository');
}

const entryPoints = ['scripts/drain-outbox.ts', 'scripts/run-operational-maintenance.ts'];

await rm(outdir, { recursive: true, force: true });
const result = await build({
  absWorkingDir: root,
  entryPoints,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outdir,
  outExtension: { '.js': '.mjs' },
  tsconfig: 'tsconfig.json',
  // `pg` requires its optional native binding lazily; it is never installed.
  external: ['pg-native'],
  // Bundled CommonJS dependencies keep working `require` calls in the ESM output.
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  legalComments: 'none',
  sourcemap: false,
  minify: false,
  metafile: true,
  logLevel: 'warning',
});

for (const [file, output] of Object.entries(result.metafile.outputs)) {
  const absolute = path.resolve(root, file);
  const digest = createHash('sha256').update(await readFile(absolute)).digest('hex');
  process.stdout.write(`${path.relative(root, absolute)} ${output.bytes} bytes sha256:${digest}\n`);
}
