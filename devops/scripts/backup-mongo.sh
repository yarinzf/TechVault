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

if ! docker compose -f "$COMPOSE_FILE" exec -T "$CONTAINER_SERVICE" \
    mongodump --db="$DB_NAME" --archive --gzip 2>/dev/null \
    > "$BACKUP_FILE"; then
    rm -f "$BACKUP_FILE"
    fail "mongodump command failed"
fi

if [ ! -s "$BACKUP_FILE" ]; then
    rm -f "$BACKUP_FILE"
    fail "mongodump produced empty output"
fi

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
log "Backup created: ${BACKUP_NAME}.gz (${BACKUP_SIZE})"

# ── Verify backup integrity ─────────────────────────────────────────────────
log "Verifying backup integrity..."

if ! gzip -t "$BACKUP_FILE" 2>/dev/null; then
    log "WARNING: gzip integrity check failed — file may be corrupted"
fi

DRY_RUN_OUTPUT=$(cat "$BACKUP_FILE" | docker compose -f "$COMPOSE_FILE" exec -T "$CONTAINER_SERVICE" \
    mongorestore --archive --gzip --dryRun --nsInclude="${DB_NAME}.*" 2>&1 || true)

COLLECTION_COUNT=$(echo "$DRY_RUN_OUTPUT" | grep -c "${DB_NAME}\." || true)
if [ "$COLLECTION_COUNT" -gt 0 ]; then
    log "Backup verification passed: ${COLLECTION_COUNT} collection(s) found in archive"
else
    log "WARNING: mongorestore --dryRun found no collections — backup may be empty or corrupted"
fi

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
