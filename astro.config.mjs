import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
export default defineConfig({
  site: 'https://jugaad.best',
  base: process.env.ASTRO_BASE ?? '/labs/field-relay',
  output: 'static',
  integrations: [react()],
});
