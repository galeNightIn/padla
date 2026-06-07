# padla

A fast, static blog. **No web fonts** (system font stack only), **no client-side
JavaScript**, and code snippets are **syntax-highlighted at build time** so the
browser does zero rendering work for them.

Built with [Astro](https://astro.build) + [Shiki](https://shiki.style), served
as static files by nginx in a tiny Docker image, deployed to a DigitalOcean
droplet automatically on every merge to `master`.

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

On push to `master`, `.github/workflows/deploy.yml`:

1. Builds the Docker image (Astro build → nginx) and pushes it to the GitHub
   Container Registry (GHCR) as `ghcr.io/<owner>/<repo>`.
2. SSHes into the droplet, pulls the image, and restarts the `blog` container
   on port 80.

### One-time droplet setup

SSH into the droplet and install Docker:

```bash
curl -fsSL https://get.docker.com | sh
```

That's all the droplet needs — the workflow handles login, pull, and run. If a
firewall is enabled, allow HTTP: `ufw allow 80/tcp`.

### GitHub secrets to set

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret             | Required | What it is |
|--------------------|----------|------------|
| `DROPLET_HOST`     | yes      | Droplet public IP (or domain), e.g. `203.0.113.10` |
| `DROPLET_USER`     | yes      | SSH user, e.g. `root` |
| `DROPLET_SSH_KEY`  | yes      | **Private** SSH key (full PEM text) whose public half is in the droplet's `~/.ssh/authorized_keys` |
| `DROPLET_SSH_PORT` | no       | SSH port if not `22` |
| `GHCR_PAT`         | yes\*    | GitHub Personal Access Token with `read:packages`, used by the droplet to pull the image |

\* `GHCR_PAT` is needed only while the GHCR package is **private** (the default).
If you instead make the package public (repo → Packages → package settings →
Change visibility → Public), the droplet can pull without it and you can drop
that secret.

> The build/push step uses the automatic `GITHUB_TOKEN` — no secret needed for
> that half.

#### Generating the SSH key (if you don't have one)

```bash
ssh-keygen -t ed25519 -f droplet_key -N ""
ssh-copy-id -i droplet_key.pub <user>@<droplet-ip>   # or paste the .pub into authorized_keys
cat droplet_key                                       # private key -> DROPLET_SSH_KEY secret
```

#### Generating the GHCR PAT

GitHub → **Settings → Developer settings → Personal access tokens → Tokens
(classic)** → generate one with the `read:packages` scope → put it in
`GHCR_PAT`.

### Pointing a domain at it

Set an `A` record for your domain to the droplet IP, then update `site` in
`astro.config.mjs`. For HTTPS, run Caddy or certbot/nginx in front — out of
scope for this minimal setup.
