# TechVault — DevOps Final Assignment

## Architecture

```
GitHub Repository
        │
        ▼
  Jenkins Pipeline
        │
        ├── npm test  (unit + integration tests)
        │
        ├── Terraform ──► AWS EC2 (Ubuntu 22.04, t3.small)
        │                    └── Security Group: 22, 3000, 5000
        │
        └── Ansible ────► EC2 instance
                               ├── Docker Engine + Compose plugin
                               ├── git clone TechVault repo
                               ├── .env.docker (secrets injected from Jenkins creds)
                               └── docker compose up -d --build
                                        ├── mongodb:27017 (persistent volume)
                                        ├── backend:5000  (Express API)
                                        └── frontend:3000 (React/Nginx)
```

**Public access:**
- Frontend storefront : `http://<EC2-IP>:3000`
- REST API            : `http://<EC2-IP>:5000/api/v1`
- Swagger docs        : `http://<EC2-IP>:5000/api-docs`
- Health check        : `http://<EC2-IP>:5000/api/v1/health`

---

## File Structure

```
devops/
├── terraform/
│   ├── provider.tf              AWS provider, required version constraints
│   ├── variables.tf             All configurable inputs
│   ├── main.tf                  Security Group + EC2 instance
│   ├── outputs.tf               IPs, URLs, SSH command
│   └── terraform.tfvars.example Copy → terraform.tfvars, fill in secrets
├── ansible/
│   ├── inventory.example.ini    Copy → inventory.ini for manual runs
│   └── deploy.yml               Full deployment playbook
├── jenkins/
│   └── Jenkinsfile              9-stage CI/CD pipeline
└── docs/
    └── DEVOPS_ASSIGNMENT.md     This file
```

---

## Jenkins Pipeline — Stage by Stage

| # | Stage | What it does |
|---|-------|-------------|
| 1 | **Checkout** | Pull latest code from GitHub |
| 2 | **Validate Project** | Verify all required files exist; run `docker compose config` |
| 3 | **Run Tests** | `npm ci && npm test` — 29 unit/integration tests |
| 4 | **Terraform Init & Plan** | `terraform init` + `terraform plan` — shows changes, no apply yet |
| 5 | **Terraform Apply** | **Manual gate** — human must click "Apply" after reviewing the plan |
| 6 | **Read Terraform Output** | Extract public IP from `terraform output -raw public_ip` |
| 7 | **Generate Inventory** | Write `ansible/inventory.ini` with the EC2 IP from step 6 |
| 8 | **Ansible Deploy** | Run `deploy.yml` — installs Docker, clones repo, starts stack, seeds DB |
| 9 | **Validate Health** | `curl` the health endpoint and frontend; fails build if either returns non-200 |

---

## Terraform Role

Terraform creates and manages two AWS resources:

**`aws_security_group` (techvault-sg)**
- Port 22  → SSH, restricted to `allowed_ssh_cidr`
- Port 3000 → Frontend (open to world)
- Port 5000 → Backend API (open to world, useful for demo/grading)
- All outbound traffic allowed

**`aws_instance` (techvault-server)**
- AMI: Latest Ubuntu 22.04 LTS (auto-fetched via `data.aws_ami`)
- Type: `t3.small` (2 vCPU / 2 GB RAM) — minimum for 3 containers
- Storage: 20 GB gp3 EBS
- SSH key: must be pre-created in AWS and name set in `terraform.tfvars`

State is stored locally by default. For Jenkins, add an S3 backend (see `provider.tf` comments).

---

## Ansible Role

`deploy.yml` runs against the EC2 instance via SSH and:

1. Installs Docker Engine + Compose plugin via official Docker apt repo
2. Clones/pulls the TechVault repo to `/opt/techvault`
3. Creates `.env.docker` from `.env.docker.example` (only if not already present)
4. Injects secrets via `lineinfile` (no plaintext secrets in any file)
5. Updates `ALLOWED_ORIGINS` and `FRONTEND_URL` to the server's public IP
6. Runs `docker compose up -d --build`
7. Waits for the `/api/v1/health` endpoint to return 200
8. Seeds all product categories (keyboards, monitors, mice, desktops, headphones)
9. Prints a deployment summary with all URLs

---

## Required Credentials — Configure in Jenkins

Go to: **Manage Jenkins → Credentials → System → Global credentials → Add Credential**

| Credential ID | Kind | Value |
|--------------|------|-------|
| `AWS_CREDENTIALS_ID` | Amazon Web Services | AWS Access Key ID + Secret Access Key |
| `SSH_KEY_CREDENTIALS_ID` | SSH Username with private key | username: `ubuntu`, private key: paste `.pem` contents |
| `TECHVAULT_JWT_ACCESS_SECRET` | Secret text | Random string, min 32 chars |
| `TECHVAULT_JWT_REFRESH_SECRET` | Secret text | Random string, min 32 chars |
| `TECHVAULT_COOKIE_SECRET` | Secret text | Random string, min 32 chars |

Generate secure secrets:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## How to Run Manually (without Jenkins)

### 1. Prerequisites

```bash
# Install Terraform >= 1.6
# Install Ansible >= 2.14
# Install Node.js >= 20
# Have AWS CLI configured: aws configure
# Have an EC2 key pair downloaded to ~/.ssh/
```

### 2. Terraform

```bash
cd devops/terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars — fill in key_pair_name, allowed_ssh_cidr
terraform init
terraform plan
terraform apply
# Note the public_ip output
```

### 3. Ansible

```bash
cd devops/ansible
cp inventory.example.ini inventory.ini
# Edit inventory.ini — replace REPLACE_WITH_SERVER_PUBLIC_IP with Terraform output
ansible-playbook -i inventory.ini deploy.yml \
  -e jwt_access_secret=YOUR_SECRET_1 \
  -e jwt_refresh_secret=YOUR_SECRET_2 \
  -e cookie_secret=YOUR_SECRET_3
```

### 4. Verify

```bash
SERVER_IP=$(cd devops/terraform && terraform output -raw public_ip)
curl http://$SERVER_IP:5000/api/v1/health
# Open browser: http://$SERVER_IP:3000
```

---

## How Jenkins Runs It

1. Create a **Pipeline** job in Jenkins
2. Set **Definition** → Pipeline script from SCM
3. Set **SCM** → Git → `https://github.com/yarinzf/TechVault.git`
4. Set **Script Path** → `devops/jenkins/Jenkinsfile`
5. Add all 5 credentials listed in the table above
6. Ensure the Jenkins agent has `terraform`, `ansible`, `node >= 20` installed
7. Click **Build Now**
8. At stage 5 (Terraform Apply) — review the plan and click **Apply**

---

## Terraform Destroy (cleanup after grading)

```bash
cd devops/terraform
terraform destroy
```

Confirm with `yes`. This terminates the EC2 instance and deletes the security group.
MongoDB data on the instance is lost; the Docker volume is not backed up.

---

## Final Validation URLs

After the pipeline completes, verify all of these:

| URL | Expected |
|-----|---------|
| `http://<IP>:3000` | React storefront loads |
| `http://<IP>:5000/api/v1/health` | `{ "data": { "status": "ok", "db": "connected" } }` |
| `http://<IP>:5000/api-docs` | Swagger UI loads |
| `http://<IP>:5000/api/v1/products?limit=5` | Returns keyboard/monitor/etc. products |

---

## Screenshots Checklist for Submission

- [ ] Jenkins pipeline — all 9 stages green
- [ ] Jenkins stage 4 — Terraform plan output visible in logs
- [ ] Jenkins stage 5 — "Apply" input gate (before clicking)
- [ ] Jenkins stage 9 — health check output showing "TechVault is live!"
- [ ] AWS Console → EC2 → running instance (show public IP)
- [ ] AWS Console → Security Groups → techvault-sg (show inbound rules)
- [ ] Browser → `http://<IP>:3000` — storefront homepage
- [ ] Browser → `http://<IP>:3000/category/keyboards` — products visible
- [ ] Browser → `http://<IP>:5000/api/v1/health` — JSON response
- [ ] Browser → `http://<IP>:5000/api-docs` — Swagger UI
- [ ] Terminal → `terraform output` — showing public_ip and URLs
- [ ] Terminal → `terraform destroy` — successful teardown (optional, after grading)

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---------|-------------|-----|
| `terraform apply` fails: `InvalidKeyPair.NotFound` | Key pair doesn't exist in AWS | Create key pair in AWS console first |
| Ansible SSH timeout | EC2 still initializing | Wait 60s after Terraform apply, re-run Ansible |
| Backend container exits | `.env.docker` secrets too short (<32 chars) | Check COOKIE_SECRET, JWT_* in Jenkins credentials |
| Frontend shows blank page | VITE_API_URL not proxied | Nginx config is correct — check `docker compose logs frontend` |
| `seed` fails in Ansible | Categories collection empty | Run `docker compose exec -T backend npm run seed` first |
