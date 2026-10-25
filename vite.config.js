import { defineConfig } from 'vite';

// The site is served from https://<user>.github.io/minecraft/ on GitHub Pages,
// so production asset URLs need that prefix. Dev keeps the root path.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/minecraft/' : '/',
}));
