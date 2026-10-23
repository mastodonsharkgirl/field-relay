import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function createPolicy(root) {
  if (root instanceof URL) root = fileURLToPath(root);
  const scripts = new Set();
  const styles = new Set();
  let htmlCount = 0;
  const hash = (text) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;
  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name === '_headers') throw Error(`Nested headers forbidden: ${path}`);
      else if (entry.name.endsWith('.html')) {
        htmlCount++;
        const html = readFileSync(path, 'utf8');
        if (/<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy/i.test(html))
          throw Error(`CSP meta forbidden: ${path}`);
        const stripped = html.replace(
          /<(script|style)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi,
          (_all, tag, attrs, body) => {
            if (tag.toLowerCase() === 'script' && /\bsrc\s*=/i.test(attrs))
              throw Error(`External script forbidden: ${path}`);
            if (/\son[a-z]+\s*=|\sstyle\s*=/i.test(attrs))
              throw Error(`Inline attribute forbidden: ${path}`);
            (tag.toLowerCase() === 'script' ? scripts : styles).add(hash(body));
            return '';
          },
        );
        if (
          /<(?:script|style)\b/i.test(stripped) ||
          /<[^>]+\s(?:on[a-z]+|style)\s*=/i.test(stripped)
        )
          throw Error(`Unsafe markup: ${path}`);
      }
    }
  }
  visit(root);
  if (!htmlCount) throw Error('No HTML found');
  const policy = `default-src 'self'; script-src 'self' ${[...scripts].sort().join(' ')}; style-src 'self' ${[...styles].sort().join(' ')}; base-uri 'self'; form-action 'none'; frame-ancestors 'none'; connect-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; img-src 'self' data:; font-src 'self'`;
  if (Buffer.byteLength(`  Content-Security-Policy: ${policy}`) > 2000)
    throw Error('CSP header line exceeds Cloudflare limit');
  return policy;
}
