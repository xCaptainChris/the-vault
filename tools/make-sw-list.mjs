// Prints the SHELL list for sw.js (dev helper): node tools/make-sw-list.mjs
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const root = new URL('..', import.meta.url).pathname;
const walk = (d) => readdirSync(join(root, d)).flatMap(f => statSync(join(root, d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]);
const files = ['index.html', 'manifest.json', ...walk('css'), ...walk('fonts').filter(f => f.endsWith('.woff2')), ...walk('js'), ...walk('icons').filter(f => f.endsWith('.png'))];
console.log(files.map(f => `  './${f}',`).join('\n'));
