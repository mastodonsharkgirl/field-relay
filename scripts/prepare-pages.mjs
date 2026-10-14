import { cpSync, mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).trim();
const artifact = join(root, '.local', 'deploy', sourceSha.slice(0, 7) + '-' + randomUUID());
const dist = join(root, 'dist');
if (!existsSync(join(dist, 'walkthrough', 'index.html')))
  throw Error('Build the interview walkthrough before packaging.');
mkdirSync(join(artifact, 'labs'), { recursive: true });
cpSync(dist, join(artifact, 'labs', 'field-relay'), { recursive: true });
writeFileSync(join(artifact, '_redirects'), '/ /labs/field-relay/ 302\n');
writeFileSync(
  join(artifact, '_headers'),
  '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  X-Robots-Tag: noindex\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n',
);
const files = [];
const inventory = (directory) => {
  for (const name of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, name.name);
    if (name.isDirectory()) inventory(path);
    else
      files.push({
        path: path.slice(artifact.length + 1).replaceAll('\\', '/'),
        sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
      });
  }
};
inventory(artifact);
// The provenance receipt sits outside the uploaded artifact.
writeFileSync(
  artifact + '.json',
  JSON.stringify({ sourceSha, packagedAt: new Date().toISOString(), files }, null, 2) + '\n',
);
console.log(artifact);
