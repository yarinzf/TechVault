# Ansible — DevOps assignment deployment

Deploys TechVault to the disposable EC2 instance created by
[`devops/terraform-assignment/`](../terraform-assignment/). Structurally
independent from [`devops/ansible/`](../ansible/) (production) — different
directory, different inventory group name (`techvault_assignment` vs
`techvault`), different deployment path on the server
(`/opt/techvault-assignment` vs `/opt/techvault`).

## Files

| File | Purpose |
|---|---|
| `deploy.yml` | The playbook |
| `inventory.example.ini` | Copy → `inventory.ini` (gitignored) for manual runs |
| `group_vars/techvault_assignment.yml` | Non-secret defaults (domain, ports, seed flag) |
| `templates/env.docker.assignment.j2` | Renders the assignment's `.env.docker` — never touches production's |
| `templates/nginx-assignment.conf.j2` | Renders the assignment's Nginx site config — HTTP-only, always (see below) |

## What it does, in order

1. Installs prerequisites, Docker Engine + Compose plugin, Nginx.
2. Clones/pulls the repo into `/opt/techvault-assignment` (`force: false` —
   see the tradeoff note in `deploy.yml`: it fails loudly on local
   modifications instead of silently discarding them).
3. Renders `.env.docker` from a template, with `ALLOWED_ORIGINS`/`FRONTEND_URL`
   *derived* from `app_domain` (if set) or the instance's public IP — never a
   hardcoded domain, and never forced to overwrite anything outside this
   directory.
4. Renders and enables an Nginx reverse-proxy site (HTTP-only — see below),
   validates the config with `nginx -t` before ever reloading
   (handler-chained), then starts Nginx.
5. Does **not** touch TLS/Certbot in any way — see "HTTPS architecture
   decision" below.
6. Builds and starts the Docker Compose stack, waits for the backend health
   endpoint. Note: the repository's `docker-compose.yml` (shared with
   production, not templated per-environment) bind-mounts
   `/opt/techvault/backups` and `/opt/techvault/logs` on the **backend**
   service unconditionally — on the assignment host these paths are
   unrelated to `/opt/techvault-assignment` and to production (a completely
   separate EC2 host); Docker auto-creates them as empty, unused
   directories. This is a cosmetic cleanup item, not a production-isolation
   issue — the assignment host has no access to production's actual
   `/opt/techvault` data regardless.
7. Optionally reseeds demo catalog data — only if `run_seed_scripts: true` is
   explicitly set; **default is false**.
8. Validates: 3 containers running, backend health (direct + through Nginx),
   frontend HTTP 200 through Nginx, and a soft Socket.IO reachability check.
9. Prints a deployment summary.

## HTTPS architecture decision

**This playbook is HTTP-only, always, on purpose. It never installs or runs
Certbot, and `nginx-assignment.conf.j2` has no HTTPS branch at all.**

### Why

An earlier draft made HTTPS conditional on a manually-set `tls_enabled: true`
flag, with the Nginx template switching to a `listen 443 ssl` block that
referenced `/etc/letsencrypt/live/{{ app_domain }}/fullchain.pem`. The risk
found in review: if that flag were ever `true` while no certificate actually
existed yet (the exact state of a fresh instance, or any run where a prior
Certbot attempt had failed), the rendered config referenced a nonexistent
certificate path — and on a host where Nginx isn't already running, `service:
state=started` with a broken vhost fails to start Nginx *at all*, taking
down HTTP too, not just HTTPS. A flag that's disconnected from whether a
certificate actually exists is exactly the kind of thing that turns "optional
HTTPS" into "occasionally breaks the whole first deploy."

A fully automatic, safe two-phase flow (deploy HTTP → obtain cert via the
still-running HTTP site → only then switch to an HTTPS template gated on
verified certificate existence, e.g. a `stat` check rather than a hand-set
flag) is possible, but it adds real choreography — ordering Nginx's own
lifecycle around an external, sometimes-slow, sometimes-rate-limited service
(Let's Encrypt) — that has not been exercised against a real server as part
of this work. Given the first-run reliability requirement, the safer choice
was to remove the automation entirely rather than ship an untested
multi-phase sequence.

### What this means in practice

| Mode | How | When to use |
|---|---|---|
| **HTTP-only (the only mode this playbook produces)** | `app_domain` empty or set — either way, Nginx always renders `listen 80` only | Every pipeline run, including grading |
| **HTTPS** | A separate, manual, human-run step — see below | Only after you have a real domain pointed at the assignment IP, and only if you want it |

### Adding HTTPS manually, later (not run by this playbook)

```bash
ssh -i ~/.ssh/techvault-assignment-key.pem ubuntu@<assignment-ip>
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-assignment-domain.example --agree-tos -m you@example.com
```

Notes:
- `certbot --nginx` edits `/etc/nginx/sites-enabled/techvault-assignment` in
  place to add the `443 ssl` block and cert paths — it only works because
  the HTTP site this playbook deployed is already valid and live.
- **Re-running `deploy.yml` after this will overwrite that manual edit**,
  reverting the site back to HTTP-only — Ansible remains the source of truth
  for this file. Either don't re-run the playbook after manually enabling
  HTTPS, or treat this as a known, documented limitation for a future
  iteration (out of scope for "the first pipeline run succeeds").
- The HTTP template already reserves `location /.well-known/acme-challenge/`
  pointing at `/var/www/certbot` (created by `deploy.yml`), so a future,
  more automated webroot-based flow has a place to serve challenge files
  without needing `--nginx`'s in-place edits at all — a natural next step if
  this is revisited.

## Environment semantics — what `NODE_ENV=production` does and doesn't mean

`templates/env.docker.assignment.j2` sets `NODE_ENV=production`. `NODE_ENV=production`
means the backend is running in production runtime mode. It does not mean
this EC2 instance is the real TechVault production environment. The
assignment environment remains fully isolated from `techvault.co.il` — its
own EC2 host, its own MongoDB container, its own `.env.docker`.

## Assignment database starts empty

The assignment MongoDB container is a fresh, empty database — it is not a
copy of, or connected to, the production catalog in any way. It stays empty
unless demo product data is explicitly seeded: `run_seed_scripts: true`
(off by default — see step 7 in "What it does, in order" above). A freshly
deployed assignment frontend showing no products is expected behavior, not
a bug.

## Secrets

`jwt_access_secret`, `jwt_refresh_secret`, `cookie_secret` are passed in via
`-e` (manual) or Jenkins credentials (pipeline) — never committed. The
template-render task that writes them into `.env.docker` uses `no_log: true`.

## Running manually

```bash
cd devops/ansible-assignment
cp inventory.example.ini inventory.ini   # fill in the assignment IP + key path
ansible-playbook -i inventory.ini deploy.yml \
  -e jwt_access_secret=YOUR_SECRET_1 \
  -e jwt_refresh_secret=YOUR_SECRET_2 \
  -e cookie_secret=YOUR_SECRET_3
```

## Safety

The first task in the play (`assert: 'techvault_assignment' in group_names`)
refuses to run at all unless the target host is in the `techvault_assignment`
inventory group — a guard against ever pointing this playbook at
`devops/ansible/inventory.ini` by accident.
