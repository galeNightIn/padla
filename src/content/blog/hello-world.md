---
title: Hello, world
description: First post. Why this blog is built the way it is.
date: 2026-06-07
---

This is a static blog built with [Astro](https://astro.build). The whole point
is **speed**: pages are plain HTML and CSS, there are **no web fonts** (only the
system font stack), and there is essentially **no JavaScript** shipped to the
browser.

Code snippets are highlighted at build time, so the colors you see are baked
into the HTML — the browser does zero work to render them:

```js
// No runtime highlighter. This was colored when the site was built.
export function greet(name) {
  return `hello, ${name}`;
}
```

Inline code like `const x = 1` uses the system monospace font too.
