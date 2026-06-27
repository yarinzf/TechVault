# TechVault Production Monitoring

## Overview

Production monitoring for TechVault consists of:
1. **Health endpoint** — `GET /api/v1/health` — lightweight, unauthenticated, used by Docker healthcheck
2. **Admin System Status** — `GET /api/v1/admin/system/status` — full server/backup/S3/health-check details (admin only)
3. **Health-check script** — `devops/scripts/health-check.sh` — checks all production components from the host
4. **Hourly cron** — writes health reports to `/opt/techvault/logs/health-check.log`
5. **Admin dashboard** — Admin → סטטוס מערכת — visual read-only dashboard with auto-refresh

---

## Health Endpoint

```
GET /api/v1/health
```

No authentication required. Returns 200 (healthy) or 503 (unhealthy = MongoDB disconnected).

The `memory.warning` flag is `true` only when RSS > 512 MB **and** system RAM > 90%. High V8 heap percentage alone does not trigger it.

### Quick Check

```bash
curl -s http://localhost:5000/api/v1/health | python3 -m json.tool
```

---

## Admin System Status Dashboard

### Endpoint

```
GET /api/v1/admin/system/status
Authorization: Bearer <admin-token>
```

Requires `admin` or `superadmin` role.

### Docker Architecture

The backend container reads host data via **read-only volume mounts**:

| Host Path | Container Path | Env Var | Purpose |
|-----------|---------------|---------|---------|
| `/opt/techvault/backups` | `/data/backups:ro` | `BACKUP_ROOT=/data/backups/mongodb` | Backup .gz files |
| `/opt/techvault/backups` | `/data/backups:ro` | `BACKUP_LOG=/data/backups/backup.log` | Backup log |
| `/opt/techvault/logs` | `/data/logs:ro` | `HEALTH_LOG=/data/logs/health-check.log` | Health-check log |
| (host env) | (container env) | `S3_BACKUP_BUCKET` | S3 bucket name |

All mounts are `:ro` — the backend cannot modify backup or log files.

### Overall Status Derivation

The dashboard computes an overall status from component statuses:

| Overall | Condition |
|---------|-----------|
| **critical** | MongoDB disconnected, or local backup very stale (>48h in production), or health-check reports CRITICAL |
| **warning** | Backup slightly stale (>26h), or S3 configured but no recent upload, or memory pressure, or health-check WARNING |
| **healthy** | MongoDB connected, recent backup, no critical/warning signals |

Optional data sources (health-check log, S3) report `unavailable` when not mounted/configured — this does **not** degrade the overall status.

### Memory Status Rules

| Status | Condition |
|--------|-----------|
| **healthy** | Normal operation |
| **warning** | System RAM > 90%, or free RAM < 200 MB, or RSS > 512 MB with RAM > 85% |
| **critical** | System RAM > 95%, or free RAM < 100 MB |

V8 `heapUsedPct` is reported for informational purposes only — high heap ratios are normal because V8 dynamically resizes `heapTotal`.

### Backup Status Rules

| Status | Condition |
|--------|-----------|
| **healthy** | Latest backup exists and is ≤ 26 hours old |
| **warning** | Latest backup is 26–48 hours old, or no backups in production |
| **critical** | Latest backup is > 48 hours old |
| **unavailable** | Backup directory not mounted (e.g. local development) |

### S3 Backup Status Rules

| Status | Condition |
|--------|-----------|
| **healthy** | `S3_BACKUP_BUCKET` set and "S3 upload complete" confirmed in backup.log within 26h |
| **warning** | Configured but no recent upload confirmation in log |
| **unavailable** | `S3_BACKUP_BUCKET` not set |

The `lastUploadConfirmed` field indicates whether any successful S3 upload was found in the backup log. `lastUploadTime` contains the parsed timestamp. The backend does **not** call AWS CLI — all S3 status is derived from log parsing.

### Health-Check Freshness Rules

| Status | Condition |
|--------|-----------|
| **healthy** | Last run ≤ 90 minutes ago and result was HEALTHY |
| **warning** | Last run 90 min–6 hours ago, or result was WARNING |
| **critical** | Last run > 6 hours ago, or result was CRITICAL |
| **unavailable** | Health-check log not mounted or empty |

The stricter of the result severity and the age-based staleness is used.

### Health-Check Status Rules

| Status | Condition |
|--------|-----------|
| **healthy** | Last RESULT line contains "HEALTHY" |
| **warning** | Last RESULT line contains "WARNING" |
| **critical** | Last RESULT line contains "CRITICAL" |
| **unavailable** | Health-check log not mounted or empty |

Includes `lastRunTime` timestamp and `ageMinutes` since last run.

### UI Status Badges

| Badge | Hebrew | Meaning |
|-------|--------|---------|
| healthy | תקין | All good |
| info | מידע | Informational |
| warning | אזהרה | Needs attention |
| critical | תקלה | Action required |
| unavailable | לא זמין | Data source not mounted / not configured |

---

## Health-Check Script

### Run Manually

```bash
sudo /opt/techvault/devops/scripts/health-check.sh
```

### What It Checks

| Category | Checks |
|----------|--------|
| Docker Containers | mongodb, backend, frontend — running + healthy |
| Backend Health | Calls `/api/v1/health`, checks status, MongoDB, heap usage |
| Frontend | HTTP response from port 3000 |
| Disk Usage | Root partition (warn >80%, critical >90%) |
| System Memory | RAM usage (warn >85%, critical >95%) |
| MongoDB Backups | Latest backup exists, age <26h, gzip integrity, log success |

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All checks passed, or warnings only (non-blocking) |
| 1 | One or more critical issues |

## Hourly Cron

```bash
(sudo crontab -l 2>/dev/null; echo "0 * * * * /opt/techvault/devops/scripts/health-check.sh >> /opt/techvault/logs/health-check.log 2>&1") | sudo crontab -
sudo mkdir -p /opt/techvault/logs
```

---

## Troubleshooting

### Container won't start

```bash
docker compose -f /opt/techvault/docker-compose.yml logs --tail=50 backend
docker compose -f /opt/techvault/docker-compose.yml logs --tail=50 mongodb
cd /opt/techvault && docker compose up -d
```

### MongoDB disconnected

```bash
docker compose -f /opt/techvault/docker-compose.yml exec mongodb mongosh --eval "db.adminCommand('ping')"
docker compose -f /opt/techvault/docker-compose.yml restart mongodb
```

### Dashboard shows "לא זמין" for backups/health-check

Verify volume mounts are working:
```bash
docker compose -f /opt/techvault/docker-compose.yml exec backend ls -la /data/backups/mongodb/
docker compose -f /opt/techvault/docker-compose.yml exec backend ls -la /data/logs/
```

If empty, verify host paths exist:
```bash
ls -la /opt/techvault/backups/mongodb/
ls -la /opt/techvault/logs/health-check.log
```

### Dashboard shows S3 "לא זמין"

Verify `S3_BACKUP_BUCKET` is set in the host environment and passed to docker compose:
```bash
echo $S3_BACKUP_BUCKET
docker compose -f /opt/techvault/docker-compose.yml exec backend printenv S3_BACKUP_BUCKET
```

### High disk usage

```bash
du -sh /opt/techvault/backups/mongodb/
docker system df
docker system prune -f
```

### Backend returning 503

```bash
docker compose -f /opt/techvault/docker-compose.yml exec mongodb mongosh --eval "db.adminCommand('ping')"
```

### Check status at a glance

```bash
docker compose -f /opt/techvault/docker-compose.yml ps
curl -s http://localhost:5000/api/v1/health | python3 -m json.tool
```
