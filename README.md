# padla

A fast, static blog. **No web fonts** (system font stack only), **no client-side
JavaScript**, and code snippets are **syntax-highlighted at build time** so the
browser does zero rendering work for them.

Built with [Astro](https://astro.build) + [Shiki](https://shiki.style) and
deployed to **GitHub Pages** automatically on every merge to `master`.

Live at: https://galenightin.github.io/padla/

## Writing a post

Drop a Markdown file in `src/content/blog/` with this frontmatter:

```text
---
title: My post
description: One-line summary shown on the index.
date: 2026-06-07
---
```

Then write the body in Markdown. Fenced code blocks are highlighted at build
time. The filename becomes the URL (`my-post.md` → `/blog/my-post/`). Merge to
`master` and it deploys itself.

## Local development

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # outputs static site to ./dist
```

## How deploy works

On push to `master`, `.github/workflows/deploy.yml` runs `astro build` and
publishes `./dist` to GitHub Pages. No secrets, no servers — Pages serves the
static files over HTTPS for free.

### One-time setup (do this once)

1. Repo → **Settings → Pages → Build and deployment → Source → "GitHub
   Actions"**. (Not "Deploy from a branch".)
2. Make sure Actions are enabled: **Settings → Actions → General → Allow all
   actions**.
3. Merge to `master` (or run the workflow manually from the **Actions** tab via
   "Run workflow"). First successful run publishes the site.

Once live: **https://galenightin.github.io/padla/**

### Base path

This is a *project* Pages site, so it's served under the `/padla/` subpath. That
is configured in `astro.config.mjs`:

```js
site: 'https://galenightin.github.io',
base: '/padla',
```

Internal links use `import.meta.env.BASE_URL` so they resolve correctly under
the subpath. **Always link internally with that prefix**, e.g.
`` `${base}/blog/${id}/` ``, never a bare `/blog/...`.

### Using a custom domain later

Add a `public/CNAME` file containing your domain, set `base: '/'` and
`site: 'https://yourdomain.com'` in `astro.config.mjs`, and point the domain's
DNS at GitHub Pages (per GitHub's
[custom domain docs](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)).
