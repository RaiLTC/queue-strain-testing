#!/usr/bin/env node
/**
 * Build the add-on into the single ES module oss!idle loads.
 *
 * The files in src/ are ordinary ES modules. The game imports an add-on as one file, so this joins them in
 * the order below into one module: each file's imports of the others are dropped (they all share one
 * scope in the result), and only the entry keeps its exports. No dependencies: `npm ci` has nothing to fetch.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await readFile(resolve(root, 'addon.config.json'), 'utf8'));
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));

/** Every file, each after the ones its top-level code needs. The entry comes last. */
const FILES = [
  'src/config.js',
  'src/rules/fatigue.js',
  'src/rules/genes.js',
  'src/rules/routes.js',
  'src/game.js',
  'src/forecast.js',
  'src/ui/style.js',
  'src/ui/parts.js',
  'src/ui/window.js',
  config.entry,
];

const LOCAL_IMPORT = /^import\s+\{[^}]*\}\s+from\s+'\.{1,2}\/[^']+';\s*$/;
const RE_EXPORT = /^export\s+\{([^}]*)\}\s+from\s+'\.{1,2}\/[^']+';\s*$/;
const EXPORTED_DECL = /^export\s+(?=(const|let|function|async function|class)\s)/;

const parts = [];
for (const file of FILES) {
  const text = await readFile(resolve(root, file), 'utf8');
  const entry = file === config.entry;
  const out = text.split('\n').map((line) => {
    if (LOCAL_IMPORT.test(line)) return null;
    if (/^import\s/.test(line)) throw new Error(`${file}: only one-line imports of the add-on's own files are supported:\n  ${line}`);
    const reExport = line.match(RE_EXPORT);
    if (reExport) return entry ? `export {${reExport[1]}};` : null;
    return entry ? line : line.replace(EXPORTED_DECL, '');
  }).filter(line => line !== null);
  parts.push(`// ---- ${file} ----\n${out.join('\n').trim()}\n`);
}

// the version players see (config.js) has to be the one being released (package.json)
const config_js = await readFile(resolve(root, 'src/config.js'), 'utf8');
const shown = (config_js.match(/^export const VERSION = '([^']+)';/m) || [])[1];
if (shown !== pkg.version) {
  throw new Error(`src/config.js says VERSION '${shown}', package.json says '${pkg.version}': make them the same`);
}

const banner = `// ${config.name} v${pkg.version} for oss!idle ${config.gameVersion}. ${config.license}. Built from ${pkg.repository?.url || 'its repository'}.\n`;
const outfile = resolve(root, config.outfile);
await mkdir(dirname(outfile), { recursive: true });
const source = banner + parts.join('\n');
await writeFile(outfile, source);
console.log(`built ${config.outfile}: ${FILES.length} files, ${(Buffer.byteLength(source) / 1024).toFixed(1)} kB`);
