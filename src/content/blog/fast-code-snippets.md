---
title: Fast code snippets, no fonts
description: How highlighting works here without shipping a single byte of JS or a font file.
date: 2026-06-07
---

Most blogs highlight code in the browser with something like Prism or
highlight.js. That means shipping a JS bundle, running it on every page load,
and often a custom font on top.

Here, [Shiki](https://shiki.style) runs once, at build time, inside Astro. The
output is just `<span>`s with inline colors:

```python
def fib(n: int) -> int:
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
```

```bash
# deploys happen automatically on merge to master
git push origin master
```

No font is downloaded, no highlighter runs in the browser, and the page stays
fast even on a slow connection.
