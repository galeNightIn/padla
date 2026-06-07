import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  // GitHub Pages project site: https://<owner>.github.io/<repo>
  site: 'https://galenightin.github.io',
  base: '/padla',
  markdown: {
    // Shiki runs at BUILD time only -> highlighted code ships as plain
    // HTML + inline colors. No syntax-highlighting JS reaches the browser.
    syntaxHighlight: 'shiki',
    shikiConfig: {
      theme: 'github-dark',
      wrap: false,
    },
  },
});
