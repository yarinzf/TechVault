#!/usr/bin/env bash
set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────────
COMPOSE_PROJECT_DIR="${COMPOSE_PROJECT_DIR:-/opt/techvault}"
COMPOSE_FILE="${COMPOSE_PROJECT_DIR}/docker-compose.yml"
CONTAINER_SERVICE="mongodb"
DB_NAME="techvault"

BACKUP_ROOT="/opt/techvault/backups/mongodb"
LOG_FILE="/opt/techvault/backups/backup.log"
RETENTION_COUNT=30
S3_BUCKET="${S3_BACKUP_BUCKET:-}"

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_NAME="techvault_${TIMESTAMP}"
BACKUP_FILE="${BACKUP_ROOT}/${BACKUP_NAME}.gz"

# ── Helpers ──────────────────────────────────────────────────────────────────
log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo "$msg"
    echo "$msg" >> "$LOG_FILE"
}

fail() {
    log "ERROR: $1"
    exit 1
}

# ── Pre-flight checks ───────────────────────────────────────────────────────
mkdir -p "$BACKUP_ROOT"
mkdir -p "$(dirname "$LOG_FILE")"

log "──────────────────────────────────────────────────"
log "Starting MongoDB backup: ${BACKUP_NAME}"

if [ ! -f "$COMPOSE_FILE" ]; then
    fail "Docker Compose file not found at ${COMPOSE_FILE}"
fi

CONTAINER_ID=$(docker compose -f "$COMPOSE_FILE" ps -q "$CONTAINER_SERVICE" 2>/dev/null || true)
if [ -z "$CONTAINER_ID" ]; then
    fail "MongoDB container '${CONTAINER_SERVICE}' is not running"
fi

HEALTH_JSON=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "$CONTAINER_ID" 2>/dev/null || echo "inspect-failed")
if [ "$HEALTH_JSON" = "healthy" ] || [ "$HEALTH_JSON" = "no-healthcheck" ]; then
    log "Container status: ${HEALTH_JSON}"
else
    log "WARNING: MongoDB container health is '${HEALTH_JSON}' (expected 'healthy')"
fi

# ── Dump ─────────────────────────────────────────────────────────────────────
log "Running mongodump for database '${DB_NAME}'..."

DUMP_LOG=$(mktemp)
if ! docker compose -f "$COMPOSE_FILE" exec -T "$CONTAINER_SERVICE" \
    mongodump --db="$DB_NAME" --archive --gzip 2>"$DUMP_LOG" \
    > "$BACKUP_FILE"; then
    rm -f "$BACKUP_FILE"
    cat "$DUMP_LOG" >> "$LOG_FILE"
    rm -f "$DUMP_LOG"
    fail "mongodump command failed"
fi

if [ ! -s "$BACKUP_FILE" ]; then
    rm -f "$BACKUP_FILE" "$DUMP_LOG"
    fail "mongodump produced empty output"
fi

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
log "Backup created: ${BACKUP_NAME}.gz (${BACKUP_SIZE})"

# ── Verify backup integrity ─────────────────────────────────────────────────
log "Verifying backup integrity..."

if ! gzip -t "$BACKUP_FILE" 2>/dev/null; then
    rm -f "$DUMP_LOG"
    fail "gzip integrity check failed — backup file is corrupted"
fi
log "gzip integrity check passed"

DUMP_COLLECTIONS=$(grep -oP "done dumping \`${DB_NAME}\.\K[^\`]+" "$DUMP_LOG" 2>/dev/null || true)
DUMP_COLLECTION_COUNT=$(echo "$DUMP_COLLECTIONS" | grep -c . 2>/dev/null || true)
DUMP_DOC_TOTAL=$(grep -oP "done dumping \`${DB_NAME}\.[^\`]+\` \(\K\d+" "$DUMP_LOG" 2>/dev/null | awk '{s+=$1} END {print s+0}' || echo "0")

if [ "$DUMP_COLLECTION_COUNT" -gt 0 ]; then
    log "Backup verified: ${DUMP_COLLECTION_COUNT} collection(s), ${DUMP_DOC_TOTAL} document(s) total"
    echo "$DUMP_COLLECTIONS" | while read -r col; do
        COL_DOCS=$(grep -oP "done dumping \`${DB_NAME}\.${col}\` \(\K\d+" "$DUMP_LOG" || echo "?")
        log "  - ${col}: ${COL_DOCS} document(s)"
    done
else
    log "WARNING: mongodump did not report any dumped collections — backup may be empty"
fi

rm -f "$DUMP_LOG"

# ── Retention cleanup ────────────────────────────────────────────────────────
TOTAL_BEFORE=$(find "$BACKUP_ROOT" -maxdepth 1 -name "techvault_*.gz" -type f ! -name "*pre-restore*" | wc -l)

if [ "$TOTAL_BEFORE" -gt "$RETENTION_COUNT" ]; then
    DELETE_COUNT=$((TOTAL_BEFORE - RETENTION_COUNT))
    log "Retention: keeping newest ${RETENTION_COUNT} backups, removing ${DELETE_COUNT} oldest"
    find "$BACKUP_ROOT" -maxdepth 1 -name "techvault_*.gz" -type f ! -name "*pre-restore*" \
        -printf "%T@ %p\n" | sort -n | head -n "$DELETE_COUNT" | cut -d' ' -f2- | xargs rm -f
else
    log "Retention: ${TOTAL_BEFORE} backup(s) present, no cleanup needed (limit: ${RETENTION_COUNT})"
fi

# ── S3 offsite sync (optional) ───────────────────────────────────────────────
if [ -n "$S3_BUCKET" ]; then
    log "Syncing backup to S3: s3://${S3_BUCKET}/mongodb/"
    if aws s3 cp "$BACKUP_FILE" "s3://${S3_BUCKET}/mongodb/${BACKUP_NAME}.gz" --quiet 2>/dev/null; then
        log "S3 upload complete"
    else
        log "WARNING: S3 upload failed — local backup is still available"
    fi
else
    log "S3 offsite sync skipped (S3_BACKUP_BUCKET not set)"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
TOTAL_BACKUPS=$(find "$BACKUP_ROOT" -maxdepth 1 -name "techvault_*.gz" -type f | wc -l)
TOTAL_SIZE=$(du -sh "$BACKUP_ROOT" 2>/dev/null | cut -f1)
log "Backup complete. Total backups: ${TOTAL_BACKUPS}, Total size: ${TOTAL_SIZE}"
log "──────────────────────────────────────────────────"
