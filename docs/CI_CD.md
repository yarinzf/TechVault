# TechVault CI/CD

## Overview

GitHub Actions runs automated checks on every push to `main` and on every pull request targeting `main`. The current phase is **CI only** — no automatic deployment.

## What the Workflow Checks

The CI pipeline (`.github/workflows/ci.yml`) runs three independent jobs:

| Job | What it does | Fails if |
|-----|-------------|----------|
| **Backend Tests** | `npm ci` + `npm test` (Jest with in-memory MongoDB) | Any test fails |
| **Frontend Build** | `npm ci` + `npm run build` (Vite) in `client/` | Build errors, TypeScript/import failures |
| **Docker Build** | Builds both backend and frontend Docker images, starts backend container to verify it boots | Dockerfile syntax errors, missing files, crash on start |

All three jobs run in parallel. The workflow passes only when all three succeed.

## How to Read Results

### On GitHub

1. Go to the repository → **Actions** tab
2. Click the latest workflow run
3. Each job shows green (passed) or red (failed)
4. Click a failed job → expand the failed step to see the error

### On Pull Requests

- CI status appears as a check below the PR description
- Green checkmark = all jobs passed
- Red X = one or more jobs failed — click "Details" to see which

### Branch Protection (Recommended)

To enforce CI before merging, enable branch protection:

1. Repository → **Settings** → **Branches** → **Add rule**
2. Branch name pattern: `main`
3. Enable: **Require status checks to pass before merging**
4. Select: `Backend Tests`, `Frontend Build`, `Docker Build`

## What Happens on Push vs PR

| Event | Behavior |
|-------|----------|
| Push to `main` | CI runs, results visible in Actions tab |
| PR to `main` | CI runs, results shown as PR checks, blocks merge if failing (with branch protection) |

## Environment & Secrets

- **Tests use in-memory MongoDB** (`mongodb-memory-server`) — no real database connection
- **Test env vars** are set in `tests/helpers/testEnv.js` — no GitHub Secrets needed for CI
- **Docker build** uses dummy env vars for container boot validation
- **No production secrets** are used or required in CI

## Current Deployment Process (Manual)

```bash
# SSH into EC2
ssh ec2-user@techvault.co.il

# Pull latest code
cd /opt/techvault && git pull origin main

# Rebuild and restart
docker compose up -d --build

# Verify
curl -s http://localhost:5000/api/v1/health | python3 -m json.tool
```

## Future Deployment Plan

Planned phases for CD:

1. **Current** — CI only (tests + build validation)
2. **Next** — Add deployment job triggered only on push to `main`, after CI passes
3. **Later** — SSH-based deploy to EC2 (`docker compose up -d --build`) using GitHub Secrets for SSH key
4. **Optional** — Blue-green or rolling deploy with health check gates

### Required GitHub Secrets for Future CD

| Secret | Purpose |
|--------|---------|
| `EC2_HOST` | Server IP or hostname |
| `EC2_SSH_KEY` | Private SSH key for deployment user |
| `EC2_USER` | SSH username (e.g., `ubuntu`) |

These are **not needed yet** — only for the deployment phase.

## Rollback Strategy

If a deployment causes issues:

### Quick Rollback (Git)

```bash
# On EC2: revert to the previous commit
cd /opt/techvault
git log --oneline -5          # find the last good commit
git checkout <commit-hash>    # switch to it
docker compose up -d --build  # rebuild from that commit
```

### Database Rollback

If the bad deployment corrupted data:

```bash
# Restore from the latest backup
sudo /opt/techvault/devops/scripts/restore-mongo.sh latest
```

### Full Disaster Recovery

See [PRODUCTION_BACKUPS.md](PRODUCTION_BACKUPS.md) for complete DR steps.
