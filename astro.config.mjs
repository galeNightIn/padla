import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  // Change this to your real domain once DNS points at the droplet.
  site: 'https://example.com',
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
