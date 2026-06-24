# TechVault CI/CD

## Overview

GitHub Actions provides two workflows:

1. **CI** (`.github/workflows/ci.yml`) — runs automatically on every push/PR to `main`
2. **Deploy** (`.github/workflows/deploy.yml`) — manual production deploy via `workflow_dispatch`

Deployment **never** runs automatically. You must trigger it by hand after CI passes.

---

## CI Workflow

### Triggers

| Event | Behavior |
|-------|----------|
| Push to `main` | CI runs, results visible in Actions tab |
| PR to `main` | CI runs, results shown as PR checks |

### Jobs (run in parallel)

| Job | What it does | Fails if |
|-----|-------------|----------|
| **Backend Tests** | `npm ci` + `npm test` (Jest with in-memory MongoDB) | Any test fails |
| **Frontend Build** | `npm ci` + `npm run build` (Vite) in `client/` | Build errors, import failures |
| **Docker Build** | Builds both Docker images, starts backend to verify it boots | Dockerfile errors, crash on start |

No secrets needed — tests use `mongodb-memory-server` and hardcoded test env vars.

### Reading CI Results

1. Repository → **Actions** tab → click the workflow run
2. Each job shows green (passed) or red (failed)
3. On PRs: status appears as a check — click "Details" on failures

### Branch Protection (Recommended)

1. **Settings** → **Branches** → **Add rule** for `main`
2. Enable **Require status checks to pass before merging**
3. Select: `Backend Tests`, `Frontend Build`, `Docker Build`

---

## Deploy Workflow

### How It Works

```
Manual trigger → git reset --hard → chmod +x → backup → docker compose build → Health verification
```

The deploy workflow:
1. Connects to EC2 via SSH
2. Syncs EC2 to `origin/main` via `git reset --hard origin/main` and restores script permissions with `chmod +x`
3. Runs `backup-mongo.sh` **(mandatory — every deploy is backed up, using the freshly synced script)**
4. Rebuilds and restarts all containers
5. Waits 15 seconds for containers to stabilize
6. Verifies the health endpoint returns `healthy`
7. Runs the full `health-check.sh` script
8. Cleans up the SSH key from the runner

If the backup step fails, the deploy stops. If the health check fails after deploy, the workflow is marked as failed (manual rollback needed).

> **Warning:** The deploy uses `git reset --hard origin/main`, which discards any local changes on EC2. Do not edit code directly on the production server — all changes must go through GitHub.

### How to Trigger

1. Go to repository → **Actions** → **Deploy to Production**
2. Click **Run workflow**
3. Select branch (default: `main`)
4. Click **Run workflow**

Only one deploy can run at a time (`concurrency: production-deploy`).

### Required GitHub Secrets

| Secret | Value | Example |
|--------|-------|---------|
| `EC2_HOST` | Server IP or domain | `1.2.3.4` or `techvault.co.il` |
| `EC2_USER` | SSH username | `ubuntu` |
| `EC2_SSH_KEY` | Full private SSH key (PEM format) | Contents of `~/.ssh/techvault-deploy.pem` |

#### Setup Steps

1. Go to repository → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret** for each:
   - `EC2_HOST` → your EC2 public IP or domain
   - `EC2_USER` → `ubuntu` (or your deploy user)
   - `EC2_SSH_KEY` → paste the full private key (including `-----BEGIN...` and `-----END...` lines)

3. (Recommended) Create a **production** environment with required reviewers:
   - **Settings** → **Environments** → **New environment** → name it `production`
   - Enable **Required reviewers** and add yourself
   - This adds a manual approval step before deploy runs

### EC2 Preparation

The deploy user must be able to run these without a password prompt:

```bash
# Verify SSH works from your local machine first
ssh -i ~/.ssh/techvault-deploy.pem ubuntu@techvault.co.il "echo OK"

# On EC2: ensure the deploy user can run backup/health scripts via sudo without password
sudo visudo
# Add this line:
# ubuntu ALL=(ALL) NOPASSWD: /opt/techvault/devops/scripts/backup-mongo.sh, /opt/techvault/devops/scripts/health-check.sh

# Verify git remote is set
cd /opt/techvault && git remote -v
# Should show: origin  git@github.com:... (or https://github.com/...)

# Ensure scripts are executable
chmod +x /opt/techvault/devops/scripts/backup-mongo.sh
chmod +x /opt/techvault/devops/scripts/health-check.sh
chmod +x /opt/techvault/devops/scripts/restore-mongo.sh
```

---

## Rollback

Rollback is **manual**. The deploy workflow does not auto-rollback on failure.

### Quick Rollback (Git revert + rebuild)

```bash
# SSH into EC2
ssh ubuntu@techvault.co.il

# Find the last known good commit
cd /opt/techvault
git log --oneline -10

# Switch to it
git checkout <good-commit-hash>

# Rebuild from that commit
docker compose up -d --build

# Verify
curl -s http://localhost:5000/api/v1/health | python3 -m json.tool
```

### Database Rollback

The deploy workflow creates a backup before every deploy. If the deployment corrupted data:

```bash
# List available backups (the most recent is the pre-deploy backup)
ls -lhrt /opt/techvault/backups/mongodb/techvault_*.gz

# Restore from it
sudo /opt/techvault/devops/scripts/restore-mongo.sh latest
```

### Full Disaster Recovery

See [PRODUCTION_BACKUPS.md](PRODUCTION_BACKUPS.md).

---

## Safety Notes

- Deploy **never** triggers automatically — manual `workflow_dispatch` only
- Pre-deploy MongoDB backup is **mandatory** — cannot be skipped, stops deployment on failure
- EC2 is a **deploy target only** — `git reset --hard origin/main` ensures it always matches GitHub exactly
- **Never edit code directly on EC2** — local changes will be discarded on the next deploy
- Health endpoint must return `healthy` or the workflow fails
- Concurrency lock prevents parallel deploys
- SSH key is cleaned up from the runner after every run (including failures)
- No production secrets are stored in the workflow file — only in GitHub Secrets
