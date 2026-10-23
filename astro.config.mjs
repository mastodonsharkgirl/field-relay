import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import { createPolicy } from './scripts/security-policy.mjs';
export default defineConfig({
  site: 'https://jugaad.best',
  base: process.env.ASTRO_BASE ?? '/labs/field-relay',
  output: 'static',
  integrations: [
    react(),
    {
      name: 'preview-csp',
      hooks: {
        'astro:config:setup': ({ command, updateConfig }) => {
          if (command === 'preview')
            updateConfig({
              server: {
                headers: {
                  'Content-Security-Policy': createPolicy(new URL('./dist/', import.meta.url)),
                },
              },
            });
        },
      },
    },
  ],
});
