# TechVault Production MongoDB Backups

## Overview

Automated daily backups of the production MongoDB database (`techvault`) running in Docker on the EC2 instance. Backups use `mongodump` with gzip compression and are stored locally on the server, with optional S3 offsite sync.

## Where Backups Are Stored

| Item | Path |
|------|------|
| Backup files | `/opt/techvault/backups/mongodb/` |
| Backup log | `/opt/techvault/backups/backup.log` |
| Backup script | `/opt/techvault/devops/scripts/backup-mongo.sh` |
| Restore script | `/opt/techvault/devops/scripts/restore-mongo.sh` |
| S3 (optional) | `s3://<S3_BACKUP_BUCKET>/mongodb/` |

Backup filenames follow the pattern: `techvault_YYYY-MM-DD_HH-MM-SS.gz`

## Automatic Backups (Cron)

A cron job runs the backup script daily at **03:00 server time**.

```
0 3 * * * /opt/techvault/devops/scripts/backup-mongo.sh >> /opt/techvault/backups/backup.log 2>&1
```

### Installing the Cron Job

```bash
# Open the root crontab editor
sudo crontab -e

# Add this line:
0 3 * * * /opt/techvault/devops/scripts/backup-mongo.sh >> /opt/techvault/backups/backup.log 2>&1
```

Or non-interactively:
```bash
(sudo crontab -l 2>/dev/null; echo "0 3 * * * /opt/techvault/devops/scripts/backup-mongo.sh >> /opt/techvault/backups/backup.log 2>&1") | sudo crontab -
```

## Retention Policy

- The backup script keeps the **newest 30 backup files**, deleting the oldest when the count exceeds 30
- Pre-restore safety backups (`*pre-restore*`) are excluded from retention and must be removed manually
- Retention cleanup runs after every backup

## Manual Backup

```bash
sudo /opt/techvault/devops/scripts/backup-mongo.sh
```

## List Backups

```bash
ls -lhrt /opt/techvault/backups/mongodb/techvault_*.gz
```

## Verify Backup Integrity

The backup script automatically runs two verification checks:
1. **gzip integrity** — validates the compressed archive is not corrupted
2. **mongorestore --dryRun** — parses the archive and counts collections without writing data

To verify manually:

```bash
LATEST=$(ls -t /opt/techvault/backups/mongodb/techvault_*.gz | head -1)

# Check gzip integrity
gzip -t "$LATEST" && echo "OK: valid gzip" || echo "FAILED: corrupted"

# Dry-run restore — lists collections without writing data
cat "$LATEST" | docker compose -f /opt/techvault/docker-compose.yml exec -T mongodb \
    mongorestore --archive --gzip --dryRun --nsInclude="techvault.*" 2>&1 | grep "techvault\."
```

## Restore from a Backup

> **WARNING**: Restoring will DROP the current database and replace it. The restore script creates a pre-restore safety backup automatically.

### Restore from a specific backup

```bash
sudo /opt/techvault/devops/scripts/restore-mongo.sh /opt/techvault/backups/mongodb/techvault_2026-06-22_03-00-00.gz
```

### Restore from the latest backup

```bash
sudo /opt/techvault/devops/scripts/restore-mongo.sh latest
```

The script will:
1. Verify the backup file exists and is a valid gzip archive
2. Inspect backup contents (collection count via `--dryRun`)
3. Show a detailed warning: database name, backup size, timestamp, collection count, and collection list
4. Ask you to type `RESTORE` to confirm
5. Ask for a second confirmation (`yes`)
6. Create a pre-restore safety backup of the current database
7. Drop and restore the database
8. Verify restored collections

## S3 Offsite Backups (Optional)

Backups can be automatically uploaded to AWS S3 after each local backup. This provides off-instance redundancy in case the EC2 instance or its EBS volume is lost.

### Setup

1. **Install the AWS CLI** on the EC2 instance:
   ```bash
   sudo apt install awscli -y    # Debian/Ubuntu
   sudo yum install awscli -y    # Amazon Linux
   ```

2. **Create an S3 bucket** (or use an existing one):
   ```bash
   aws s3 mb s3://techvault-backups-production
   ```

3. **Create an IAM policy** with minimal permissions:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "s3:PutObject",
           "s3:GetObject",
           "s3:ListBucket"
         ],
         "Resource": [
           "arn:aws:s3:::techvault-backups-production",
           "arn:aws:s3:::techvault-backups-production/*"
         ]
       }
     ]
   }
   ```

4. **Configure credentials** — use an IAM role attached to the EC2 instance (preferred) or configure credentials:
   ```bash
   aws configure
   ```

5. **Set the environment variable** in the cron job:
   ```
   0 3 * * * S3_BACKUP_BUCKET=techvault-backups-production /opt/techvault/devops/scripts/backup-mongo.sh >> /opt/techvault/backups/backup.log 2>&1
   ```

   Or export it in `/etc/environment`:
   ```bash
   echo 'S3_BACKUP_BUCKET=techvault-backups-production' | sudo tee -a /etc/environment
   ```

### Manual S3 Sync

```bash
# Upload all local backups to S3
aws s3 sync /opt/techvault/backups/mongodb/ s3://techvault-backups-production/mongodb/

# Download a backup from S3
aws s3 cp s3://techvault-backups-production/mongodb/techvault_2026-06-22_03-00-00.gz /opt/techvault/backups/mongodb/
```

### Restore from S3

```bash
# Download the backup
aws s3 cp s3://techvault-backups-production/mongodb/techvault_2026-06-22_03-00-00.gz /opt/techvault/backups/mongodb/

# Restore it
sudo /opt/techvault/devops/scripts/restore-mongo.sh /opt/techvault/backups/mongodb/techvault_2026-06-22_03-00-00.gz
```

## Disaster Recovery

If the EC2 instance crashes or is terminated:

1. **Launch a new EC2 instance** with the same configuration (see `devops/terraform/`)
2. **Deploy TechVault** using the Ansible playbook or manual Docker Compose setup
3. **Retrieve backups** from one of:
   - **S3** (if offsite sync was enabled):
     ```bash
     aws s3 sync s3://techvault-backups-production/mongodb/ /opt/techvault/backups/mongodb/
     ```
   - **Old EBS volume** (if still accessible):
     ```bash
     cp /mnt/old-data/opt/techvault/backups/mongodb/*.gz /opt/techvault/backups/mongodb/
     ```
4. **Restore from the latest backup**:
   ```bash
   sudo /opt/techvault/devops/scripts/restore-mongo.sh latest
   ```

## What NOT to Commit to GitHub

- Backup files (`*.gz`, `*.tar.gz`)
- The `backups/` directory
- Backup logs
- Any file containing database dumps
- AWS credentials or S3 bucket names with credentials

These are already excluded in `.gitignore`.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "MongoDB container is not running" | Docker Compose services are down | `cd /opt/techvault && docker compose up -d` |
| Empty backup file | mongodump failed silently | Check Docker logs: `docker compose logs mongodb` |
| "dryRun found no collections" | Backup is empty or corrupted | Re-run backup, check disk space |
| "S3 upload failed" | Missing credentials or bucket | Run `aws sts get-caller-identity` to verify IAM |
| Restore shows no collections | Wrong backup file or corrupted | Try a different backup file |
