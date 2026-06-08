import { defineConfig } from 'astro/config';

// Wrap every <table> in <div class="table-wrap"> so wide tables scroll
// horizontally instead of breaking the layout. Self-contained (no deps).
function rehypeWrapTables() {
  return (tree) => {
    const walk = (node) => {
      if (!node.children) return;
      node.children = node.children.map((child) => {
        walk(child);
        if (child.type === 'element' && child.tagName === 'table') {
          return {
            type: 'element',
            tagName: 'div',
            properties: { className: ['table-wrap'] },
            children: [child],
          };
        }
        return child;
      });
    };
    walk(tree);
  };
}

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
    rehypePlugins: [rehypeWrapTables],
  },
});
