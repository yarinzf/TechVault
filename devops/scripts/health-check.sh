#!/usr/bin/env bash
set -uo pipefail

# ── Configuration ────────────────────────────────────────────────────────────
COMPOSE_PROJECT_DIR="${COMPOSE_PROJECT_DIR:-/opt/techvault}"
COMPOSE_FILE="${COMPOSE_PROJECT_DIR}/docker-compose.yml"
HEALTH_URL="${HEALTH_URL:-http://localhost:5000/api/v1/health}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"
BACKUP_ROOT="/opt/techvault/backups/mongodb"
BACKUP_LOG="/opt/techvault/backups/backup.log"

DISK_WARN_PCT=80
DISK_CRIT_PCT=90
MEM_WARN_PCT=85
MEM_CRIT_PCT=95
BACKUP_MAX_AGE_HOURS=26

# ── State tracking ───────────────────────────────────────────────────────────
WARNINGS=0
CRITICALS=0
CHECKS=0

ok()       { CHECKS=$((CHECKS + 1)); echo "  [OK]       $1"; }
warn()     { CHECKS=$((CHECKS + 1)); WARNINGS=$((WARNINGS + 1)); echo "  [WARNING]  $1"; }
critical() { CHECKS=$((CHECKS + 1)); CRITICALS=$((CRITICALS + 1)); echo "  [CRITICAL] $1"; }

# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "TechVault Production Health Check"
echo "$(date '+%Y-%m-%d %H:%M:%S')"
echo "────────────────────────────────────────────────────"

# ── 1. Docker containers ────────────────────────────────────────────────────
echo ""
echo "Docker Containers:"

for SERVICE in mongodb backend frontend; do
    CID=$(docker compose -f "$COMPOSE_FILE" ps -q "$SERVICE" 2>/dev/null || true)
    if [ -z "$CID" ]; then
        critical "${SERVICE}: not running"
        continue
    fi

    STATE=$(docker inspect --format='{{.State.Status}}' "$CID" 2>/dev/null || echo "unknown")
    if [ "$STATE" != "running" ]; then
        critical "${SERVICE}: state is '${STATE}'"
        continue
    fi

    HEALTH=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "$CID" 2>/dev/null || echo "unknown")
    if [ "$HEALTH" = "healthy" ] || [ "$HEALTH" = "no-healthcheck" ]; then
        ok "${SERVICE}: running (${HEALTH})"
    else
        warn "${SERVICE}: running but health is '${HEALTH}'"
    fi
done

# ── 2. Backend health endpoint ───────────────────────────────────────────────
echo ""
echo "Backend Health Endpoint:"

HEALTH_TMP=$(mktemp)
trap "rm -f $HEALTH_TMP" EXIT

HEALTH_HTTP=$(curl -sf --max-time 10 -o "$HEALTH_TMP" -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")
if [ "$HEALTH_HTTP" = "000" ] || [ ! -s "$HEALTH_TMP" ]; then
    critical "Backend health endpoint unreachable: ${HEALTH_URL}"
else
    PARSED=$(python3 -c '
import json, sys
try:
    d = json.load(open(sys.argv[1]))["data"]
    m = d.get("memory", {})
    print(d.get("status", "unknown"))
    print(d.get("mongodb", {}).get("status", "unknown"))
    print(d.get("uptime", 0))
    print(d.get("version", "?"))
    print(m.get("heapUsedPct", "0%").rstrip("%"))
    print(str(m.get("warning", False)).lower())
except Exception:
    print("parse-error")
    sys.exit(1)
' "$HEALTH_TMP" 2>/dev/null || echo "parse-error")

    if [ "$(echo "$PARSED" | sed -n '1p')" = "parse-error" ]; then
        PREVIEW=$(head -c 500 "$HEALTH_TMP" 2>/dev/null || true)
        critical "Backend returned invalid JSON: ${PREVIEW}"
    else
        APP_STATUS=$(echo "$PARSED" | sed -n '1p')
        DB_STATUS=$(echo "$PARSED" | sed -n '2p')
        UPTIME=$(echo "$PARSED" | sed -n '3p')
        VERSION=$(echo "$PARSED" | sed -n '4p')
        HEAP_PCT=$(echo "$PARSED" | sed -n '5p')
        MEM_WARNING=$(echo "$PARSED" | sed -n '6p')

        if [ "$APP_STATUS" = "healthy" ]; then
            ok "Status: ${APP_STATUS} (v${VERSION}, uptime: ${UPTIME}s)"
        elif [ "$APP_STATUS" = "degraded" ]; then
            warn "Status: ${APP_STATUS} (v${VERSION}, uptime: ${UPTIME}s)"
        else
            critical "Status: ${APP_STATUS} (v${VERSION})"
        fi

        if [ "$DB_STATUS" = "connected" ]; then
            ok "MongoDB: ${DB_STATUS}"
        else
            critical "MongoDB: ${DB_STATUS}"
        fi

        if [ "$MEM_WARNING" = "true" ]; then
            warn "Heap usage: ${HEAP_PCT}% (memory.warning flagged)"
        else
            ok "Heap usage: ${HEAP_PCT}%"
        fi
    fi
fi

# ── 3. Frontend HTTP response ────────────────────────────────────────────────
echo ""
echo "Frontend:"

FRONTEND_HTTP=$(curl -so /dev/null --max-time 10 -w "%{http_code}" "$FRONTEND_URL" 2>/dev/null || echo "000")
if [ "$FRONTEND_HTTP" = "200" ]; then
    ok "Frontend responding (HTTP ${FRONTEND_HTTP})"
elif [ "$FRONTEND_HTTP" = "000" ]; then
    critical "Frontend unreachable at ${FRONTEND_URL}"
else
    warn "Frontend returned HTTP ${FRONTEND_HTTP}"
fi

# ── 4. Disk usage ────────────────────────────────────────────────────────────
echo ""
echo "Disk Usage:"

DISK_PCT=$(df / 2>/dev/null | awk 'NR==2 {gsub(/%/,""); print $5}' || echo "0")
DISK_AVAIL=$(df -h / 2>/dev/null | awk 'NR==2 {print $4}' || echo "?")

if [ "$DISK_PCT" -ge "$DISK_CRIT_PCT" ]; then
    critical "Root disk: ${DISK_PCT}% used (${DISK_AVAIL} available)"
elif [ "$DISK_PCT" -ge "$DISK_WARN_PCT" ]; then
    warn "Root disk: ${DISK_PCT}% used (${DISK_AVAIL} available)"
else
    ok "Root disk: ${DISK_PCT}% used (${DISK_AVAIL} available)"
fi

if [ -d "$BACKUP_ROOT" ]; then
    BACKUP_DISK=$(du -sh "$BACKUP_ROOT" 2>/dev/null | cut -f1)
    ok "Backup storage: ${BACKUP_DISK}"
fi

# ── 5. System memory ────────────────────────────────────────────────────────
echo ""
echo "System Memory:"

MEM_INFO=$(free 2>/dev/null | awk 'NR==2 {printf "%d %d", $3/$2*100, ($2-$3)/1024/1024}' || echo "0 0")
MEM_PCT=$(echo "$MEM_INFO" | awk '{print $1}')
MEM_AVAIL_GB=$(echo "$MEM_INFO" | awk '{print $2}')

if [ "$MEM_PCT" -ge "$MEM_CRIT_PCT" ]; then
    critical "RAM: ${MEM_PCT}% used (${MEM_AVAIL_GB}GB available)"
elif [ "$MEM_PCT" -ge "$MEM_WARN_PCT" ]; then
    warn "RAM: ${MEM_PCT}% used (${MEM_AVAIL_GB}GB available)"
else
    ok "RAM: ${MEM_PCT}% used (${MEM_AVAIL_GB}GB available)"
fi

# ── 6. MongoDB backups ──────────────────────────────────────────────────────
echo ""
echo "MongoDB Backups:"

if [ ! -d "$BACKUP_ROOT" ]; then
    warn "Backup directory not found: ${BACKUP_ROOT}"
else
    LATEST_BACKUP=$(find "$BACKUP_ROOT" -maxdepth 1 -name "techvault_*.gz" -type f -printf "%T@ %p\n" 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)

    if [ -z "$LATEST_BACKUP" ]; then
        critical "No backup files found"
    else
        BACKUP_AGE_SEC=$(( $(date +%s) - $(stat -c %Y "$LATEST_BACKUP") ))
        BACKUP_AGE_HOURS=$(( BACKUP_AGE_SEC / 3600 ))
        BACKUP_SIZE=$(du -h "$LATEST_BACKUP" | cut -f1)
        BACKUP_NAME=$(basename "$LATEST_BACKUP")
        TOTAL_BACKUPS=$(find "$BACKUP_ROOT" -maxdepth 1 -name "techvault_*.gz" -type f | wc -l)

        if [ "$BACKUP_AGE_HOURS" -le "$BACKUP_MAX_AGE_HOURS" ]; then
            ok "Latest: ${BACKUP_NAME} (${BACKUP_SIZE}, ${BACKUP_AGE_HOURS}h ago)"
        else
            warn "Latest backup is ${BACKUP_AGE_HOURS}h old: ${BACKUP_NAME}"
        fi

        ok "Total backups: ${TOTAL_BACKUPS}"

        if gzip -t "$LATEST_BACKUP" 2>/dev/null; then
            ok "Latest backup integrity: valid gzip"
        else
            critical "Latest backup integrity: CORRUPTED"
        fi
    fi

    if [ -f "$BACKUP_LOG" ]; then
        LAST_LOG_LINE=$(tail -5 "$BACKUP_LOG" | grep -i "backup complete" | tail -1 || true)
        if [ -n "$LAST_LOG_LINE" ]; then
            ok "Backup log: last success — ${LAST_LOG_LINE}"
        else
            warn "Backup log: no recent 'Backup complete' entry found"
        fi
    else
        warn "Backup log not found: ${BACKUP_LOG}"
    fi
fi

# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "────────────────────────────────────────────────────"

if [ "$CRITICALS" -gt 0 ]; then
    echo "RESULT: CRITICAL — ${CRITICALS} critical, ${WARNINGS} warning(s) out of ${CHECKS} checks"
    echo ""
    exit 1
elif [ "$WARNINGS" -gt 0 ]; then
    echo "RESULT: WARNING — ${WARNINGS} warning(s) out of ${CHECKS} checks"
    echo ""
    exit 1
else
    echo "RESULT: HEALTHY — all ${CHECKS} checks passed"
    echo ""
    exit 0
fi
