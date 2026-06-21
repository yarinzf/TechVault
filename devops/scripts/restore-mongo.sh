#!/usr/bin/env bash
set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────────
COMPOSE_PROJECT_DIR="${COMPOSE_PROJECT_DIR:-/opt/techvault}"
COMPOSE_FILE="${COMPOSE_PROJECT_DIR}/docker-compose.yml"
CONTAINER_SERVICE="mongodb"
DB_NAME="techvault"

BACKUP_ROOT="/opt/techvault/backups/mongodb"

# ── Helpers ──────────────────────────────────────────────────────────────────
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

fail() {
    log "ERROR: $1"
    exit 1
}

usage() {
    echo ""
    echo "Usage: $0 <backup-file>"
    echo ""
    echo "  <backup-file>   Path to a .gz backup file created by backup-mongo.sh"
    echo "                  Use 'latest' to restore the most recent backup"
    echo ""
    echo "Examples:"
    echo "  $0 /opt/techvault/backups/mongodb/techvault_2026-06-22_03-00-00.gz"
    echo "  $0 latest"
    echo ""
    echo "Available backups:"
    if [ -d "$BACKUP_ROOT" ]; then
        find "$BACKUP_ROOT" -name "techvault_*.gz" -type f -printf "  %T+ %p\n" 2>/dev/null | sort -r | head -10
        TOTAL=$(find "$BACKUP_ROOT" -name "techvault_*.gz" -type f | wc -l)
        echo "  (${TOTAL} total backup(s))"
    else
        echo "  No backups found at ${BACKUP_ROOT}"
    fi
    echo ""
    exit 1
}

# ── Argument handling ────────────────────────────────────────────────────────
if [ $# -lt 1 ]; then
    usage
fi

BACKUP_FILE="$1"

if [ "$BACKUP_FILE" = "latest" ]; then
    BACKUP_FILE=$(find "$BACKUP_ROOT" -name "techvault_*.gz" -type f -printf "%T@ %p\n" 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)
    if [ -z "$BACKUP_FILE" ]; then
        fail "No backups found in ${BACKUP_ROOT}"
    fi
    log "Latest backup: ${BACKUP_FILE}"
fi

# ── Pre-flight checks ───────────────────────────────────────────────────────
if [ ! -f "$BACKUP_FILE" ]; then
    fail "Backup file not found: ${BACKUP_FILE}"
fi

if ! gzip -t "$BACKUP_FILE" 2>/dev/null; then
    fail "Backup file is corrupted or not a valid gzip archive: ${BACKUP_FILE}"
fi

if [ ! -f "$COMPOSE_FILE" ]; then
    fail "Docker Compose file not found at ${COMPOSE_FILE}"
fi

CONTAINER_ID=$(docker compose -f "$COMPOSE_FILE" ps -q "$CONTAINER_SERVICE" 2>/dev/null || true)
if [ -z "$CONTAINER_ID" ]; then
    fail "MongoDB container '${CONTAINER_SERVICE}' is not running"
fi

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
BACKUP_DATE=$(stat -c %y "$BACKUP_FILE" 2>/dev/null | cut -d'.' -f1)

# ── Inspect backup contents ─────────────────────────────────────────────────
log "Inspecting backup contents..."
DRY_RUN_OUTPUT=$(cat "$BACKUP_FILE" | docker compose -f "$COMPOSE_FILE" exec -T "$CONTAINER_SERVICE" \
    mongorestore --archive --gzip --dryRun --nsInclude="${DB_NAME}.*" 2>&1 || true)

BACKUP_COLLECTIONS=$(echo "$DRY_RUN_OUTPUT" | grep -oP "${DB_NAME}\.\K[^ ]+" | sort -u || true)
BACKUP_COLLECTION_COUNT=$(echo "$BACKUP_COLLECTIONS" | grep -c . || true)

if [ "$BACKUP_COLLECTION_COUNT" -eq 0 ]; then
    log "WARNING: Could not detect collections in backup — archive may be empty"
fi

# ── Confirmation ─────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                    DATABASE RESTORE WARNING                    ║"
echo "╠══════════════════════════════════════════════════════════════════╣"
echo "║                                                                ║"
echo "║  This will DROP the '${DB_NAME}' database and replace it"
echo "║  with data from the backup file."
echo "║                                                                ║"
echo "║  Backup file  : $(basename "$BACKUP_FILE")"
echo "║  Backup size  : ${BACKUP_SIZE}"
echo "║  Backup date  : ${BACKUP_DATE}"
echo "║  Target DB    : ${DB_NAME}"
echo "║  Collections  : ${BACKUP_COLLECTION_COUNT} found in archive"
if [ -n "$BACKUP_COLLECTIONS" ]; then
    echo "$BACKUP_COLLECTIONS" | while read -r col; do
        echo "║    - ${col}"
    done
fi
echo "║                                                                ║"
echo "║  THIS ACTION CANNOT BE UNDONE.                                 ║"
echo "║                                                                ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
read -p "Type 'RESTORE' to confirm: " CONFIRM

if [ "$CONFIRM" != "RESTORE" ]; then
    log "Restore cancelled by user"
    exit 0
fi

echo ""
read -p "Are you ABSOLUTELY sure? This will delete all current data in '${DB_NAME}'. (yes/no): " CONFIRM2

if [ "$CONFIRM2" != "yes" ]; then
    log "Restore cancelled by user"
    exit 0
fi

# ── Create pre-restore backup ───────────────────────────────────────────────
log "Creating pre-restore safety backup..."
PRE_RESTORE_NAME="techvault_pre-restore_$(date +%Y-%m-%d_%H-%M-%S).gz"
PRE_RESTORE_PATH="${BACKUP_ROOT}/${PRE_RESTORE_NAME}"

if ! docker compose -f "$COMPOSE_FILE" exec -T "$CONTAINER_SERVICE" \
    mongodump --db="$DB_NAME" --archive --gzip 2>/dev/null \
    > "$PRE_RESTORE_PATH"; then
    rm -f "$PRE_RESTORE_PATH"
    echo ""
    read -p "WARNING: Pre-restore backup failed. Continue anyway? (yes/no): " CONTINUE
    if [ "$CONTINUE" != "yes" ]; then
        log "Restore cancelled — pre-restore backup failed"
        exit 1
    fi
elif [ ! -s "$PRE_RESTORE_PATH" ]; then
    rm -f "$PRE_RESTORE_PATH"
    echo ""
    read -p "WARNING: Pre-restore backup is empty. Continue anyway? (yes/no): " CONTINUE
    if [ "$CONTINUE" != "yes" ]; then
        log "Restore cancelled — pre-restore backup empty"
        exit 1
    fi
else
    log "Pre-restore backup saved: ${PRE_RESTORE_PATH}"
fi

# ── Restore ──────────────────────────────────────────────────────────────────
log "Starting restore from: $(basename "$BACKUP_FILE")"
log "Dropping database '${DB_NAME}' and restoring..."

if ! cat "$BACKUP_FILE" | docker compose -f "$COMPOSE_FILE" exec -T "$CONTAINER_SERVICE" \
    mongorestore --archive --gzip --drop --nsInclude="${DB_NAME}.*" 2>&1; then
    fail "mongorestore failed. Pre-restore backup available at: ${PRE_RESTORE_PATH}"
fi

# ── Verify ───────────────────────────────────────────────────────────────────
log "Verifying restore..."
COLLECTIONS=$(docker compose -f "$COMPOSE_FILE" exec -T "$CONTAINER_SERVICE" \
    mongosh --quiet --eval "db.getSiblingDB('${DB_NAME}').getCollectionNames().join(', ')" 2>/dev/null || true)

if [ -n "$COLLECTIONS" ]; then
    log "Restored collections: ${COLLECTIONS}"
else
    log "WARNING: No collections found after restore"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
log "Restore completed successfully!"
log "Pre-restore backup: ${PRE_RESTORE_PATH}"
echo ""
echo "  If something went wrong, you can restore the pre-restore backup:"
echo "  sudo $0 ${PRE_RESTORE_PATH}"
echo ""
