# TechVault Production Monitoring

## Overview

Production monitoring for TechVault consists of:
1. **Health endpoint** — `GET /api/v1/health` returns live application + database status
2. **Health-check script** — `devops/scripts/health-check.sh` checks all production components
3. **Hourly cron** (optional) — writes health reports to `/opt/techvault/logs/health-check.log`

## Health Endpoint

### Request

```
GET /api/v1/health
```

No authentication required. Used by Docker Compose healthcheck internally.

### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "uptime": 86400,
    "environment": "production",
    "version": "1.0.0",
    "node": "v20.11.0",
    "mongodb": {
      "status": "connected",
      "readyState": 1
    },
    "memory": {
      "rss": "95.2 MB",
      "heapUsed": "42.1 MB",
      "heapTotal": "65.3 MB",
      "external": "3.8 MB",
      "heapUsedPct": "64.5%"
    },
    "timestamp": "2026-06-23T12:00:00.000Z"
  }
}
```

### Status Values

| Status | HTTP Code | Meaning |
|--------|-----------|---------|
| `healthy` | 200 | All systems operational |
| `unhealthy` | 503 | MongoDB disconnected |

The `memory.warning` field is `true` when heap usage exceeds 90%. This is informational only — it does not affect the `status` field.

### Quick Check from EC2

```bash
curl -s http://localhost:5000/api/v1/health | python3 -m json.tool
```

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

### Output Format

```
TechVault Production Health Check
2026-06-23 12:00:00
────────────────────────────────────────────────────
Docker Containers:
  [OK]       mongodb: running (healthy)
  [OK]       backend: running (healthy)
  [OK]       frontend: running (healthy)

Backend Health Endpoint:
  [OK]       Status: healthy (v1.0.0, uptime: 86400s)
  [OK]       MongoDB: connected
  [OK]       Heap usage: 64.5%
...
────────────────────────────────────────────────────
RESULT: HEALTHY — all 14 checks passed
```

## Hourly Cron (Optional)

```bash
# Install: run health check every hour, log results
(sudo crontab -l 2>/dev/null; echo "0 * * * * /opt/techvault/devops/scripts/health-check.sh >> /opt/techvault/logs/health-check.log 2>&1") | sudo crontab -
```

Create the log directory:
```bash
sudo mkdir -p /opt/techvault/logs
```

View recent results:
```bash
tail -50 /opt/techvault/logs/health-check.log
```

## Troubleshooting Common Production Issues

### Container won't start

```bash
# Check logs for the failing service
docker compose -f /opt/techvault/docker-compose.yml logs --tail=50 backend
docker compose -f /opt/techvault/docker-compose.yml logs --tail=50 mongodb

# Restart all services
cd /opt/techvault && docker compose up -d
```

### MongoDB disconnected

```bash
# Check MongoDB container health
docker compose -f /opt/techvault/docker-compose.yml exec mongodb mongosh --eval "db.adminCommand('ping')"

# Check MongoDB logs
docker compose -f /opt/techvault/docker-compose.yml logs --tail=30 mongodb

# Restart MongoDB only
docker compose -f /opt/techvault/docker-compose.yml restart mongodb
```

### High disk usage

```bash
# Check what's consuming space
du -sh /opt/techvault/backups/mongodb/
du -sh /var/lib/docker/
docker system df

# Clean unused Docker resources (safe)
docker system prune -f
```

### High memory usage

```bash
# Check per-container memory
docker stats --no-stream

# Check system memory
free -h

# Restart services to reclaim memory
cd /opt/techvault && docker compose restart
```

### Backend returning 503

The health endpoint returns 503 when MongoDB is disconnected. Check MongoDB first:
```bash
docker compose -f /opt/techvault/docker-compose.yml exec mongodb mongosh --eval "db.adminCommand('ping')"
```

### Backup not running

```bash
# Verify cron is installed
sudo crontab -l | grep backup

# Check backup log
tail -20 /opt/techvault/backups/backup.log

# Run backup manually
sudo /opt/techvault/devops/scripts/backup-mongo.sh
```

### Check Docker status at a glance

```bash
docker compose -f /opt/techvault/docker-compose.yml ps
```
