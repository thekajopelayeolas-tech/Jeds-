import { defineConfig } from 'vite';

// GitHub Pages serves project sites from https://<user>.github.io/<repo>/, so
// production asset URLs need the repo name as a prefix. GITHUB_REPOSITORY is set
// by GitHub Actions ("owner/repo"). Local builds and dev keep the root path.
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];

export default defineConfig(({ command }) => ({
  base: command === 'build' && repo ? `/${repo}/` : '/',
}));
