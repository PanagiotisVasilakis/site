import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function replaceDirectory(source, destination) {
  if (!existsSync(source)) {
    throw new Error(`Standalone source directory not found: ${source}`);
  }

  // cpSync merges into an existing directory and leaves files that disappeared
  // from the source. Remove only the generated destination so old chunks/assets
  // cannot survive a new build.
  rmSync(destination, { recursive: true, force: true });
  cpSync(source, destination, { recursive: true, force: true });
}

export function prepareStandalone(root = process.cwd()) {
  const standalone = join(root, '.next', 'standalone');
  if (!existsSync(join(standalone, 'server.js'))) {
    throw new Error('Standalone build not found. Run npm run build before npm start.');
  }

  mkdirSync(join(standalone, '.next'), { recursive: true });
  replaceDirectory(join(root, '.next', 'static'), join(standalone, '.next', 'static'));

  const publicSource = join(root, 'public');
  const publicDestination = join(standalone, 'public');
  if (existsSync(publicSource)) {
    replaceDirectory(publicSource, publicDestination);
  } else {
    rmSync(publicDestination, { recursive: true, force: true });
  }

  // Next's image optimizer writes beneath the standalone dist directory. Create
  // the path during build/prestart so hardened deployments can grant the smallest
  // possible writable subtree.
  mkdirSync(join(standalone, '.next', 'cache', 'images'), { recursive: true });
}

const isMain = process.argv[1]
  ? fileURLToPath(import.meta.url) === resolve(process.argv[1])
  : false;

if (isMain) {
  prepareStandalone();
}
