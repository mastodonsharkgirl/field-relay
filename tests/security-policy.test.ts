import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPolicy } from '../scripts/security-policy.mjs';

describe('generated security policy', () => {
  it('hashes inline content and rejects unsafe markup', () => {
    const dir = mkdtempSync(join(tmpdir(), 'field-policy-'));
    try {
      expect(() => createPolicy(dir)).toThrow('No HTML found');
      const file = join(dir, 'index.html');
      writeFileSync(file, '<script>hello()</script><style>body{color:red}</style>');
      expect(createPolicy(dir)).toContain("'sha256-");
      for (const html of [
        '<script src="https://example.com/a.js"></script>',
        '<div onclick="go()">',
        '<p style="color:red">',
        '<meta http-equiv="Content-Security-Policy" content="x">',
      ]) {
        writeFileSync(file, html);
        expect(() => createPolicy(dir)).toThrow();
      }
      writeFileSync(file, Array.from({ length: 50 }, (_, i) => `<script>${i}</script>`).join(''));
      expect(() => createPolicy(dir)).toThrow('exceeds Cloudflare limit');
      writeFileSync(join(dir, '_headers'), '/*\n  Content-Security-Policy: x');
      expect(() => createPolicy(dir)).toThrow('Nested headers forbidden');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
