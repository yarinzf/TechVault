# TechVault

A production-grade e-commerce platform for PC hardware and peripherals —
Node.js/Express + MongoDB backend, React/Vite storefront, Stripe checkout,
Socket.IO live features, and a full Docker Compose deployment.

**Live:** [https://techvault.co.il](https://techvault.co.il)

## Documentation map

| Document | Covers |
|---|---|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Application architecture — layers, request flow, module map, tech stack |
| [`devops/docs/DEVOPS_ASSIGNMENT.md`](devops/docs/DEVOPS_ASSIGNMENT.md) | Infrastructure/DevOps: production vs. the isolated assignment environment, Terraform, Ansible, Jenkins |
| [`devops/terraform-assignment/README.md`](devops/terraform-assignment/README.md) | Assignment application Terraform module — state isolation, safe commands |
| [`devops/ansible-assignment/README.md`](devops/ansible-assignment/README.md) | Assignment application Ansible playbook — HTTPS decision, secrets, safety gate |
| [`devops/terraform-jenkins/README.md`](devops/terraform-jenkins/README.md) | Jenkins host Terraform module — sizing decisions, state isolation |
| [`devops/ansible-jenkins/README.md`](devops/ansible-jenkins/README.md) | Jenkins host Ansible playbook — tool installation, Docker permission model, HTTPS decision |
| [`devops/jenkins/README.md`](devops/jenkins/README.md) | Jenkins host architecture, complete setup sequence, plugins, instructor permission model |

## Stack

- **Backend**: Node.js 20, Express 4, MongoDB 7 + Mongoose 8, JWT auth, Stripe, Socket.IO, Winston logging, Prometheus metrics
- **Frontend**: React + Vite, served via Nginx in its own container
- **Infra**: Docker Compose (mongodb, backend, frontend), host-level Nginx reverse proxy + Let's Encrypt in production

## Local development

```bash
npm install
cp .env.example .env          # fill in local values
npm run dev                    # backend, with nodemon
cd client && npm install && npm run dev   # frontend, separate terminal
```

## Running the full stack with Docker

```bash
cp .env.docker.example .env.docker   # fill in real secrets (min 32 chars each)
docker compose up -d --build
curl http://localhost:5000/api/v1/health
```

## Tests

```bash
npm test              # backend — complete Jest suite (unit + integration)
cd client && npm run build   # frontend production build
```

## Production vs. DevOps assignment

Production (`techvault.co.il`) is already live and is deployed independently
of the Terraform/Ansible/Jenkins pipeline described below.

The DevOps assignment pipeline is **complete and live**, running on two
fully isolated EC2 hosts that are never allowed to touch the production
server: a disposable assignment application server, and a persistent
Jenkins host that stays up for the life of the assignment/grading period —
see `devops/docs/DEVOPS_ASSIGNMENT.md` for the full picture.

| Assignment resource | URL |
|---|---|
| Jenkins | http://3.68.18.214/ |
| Assignment frontend | http://63.180.236.144 |
| Assignment backend health | http://63.180.236.144/api/v1/health |

Last successful pipeline run: **Build #8 — SUCCESS** (all stages green,
72/72 backend tests, Terraform apply 0 added / 0 changed / 0 destroyed,
Ansible `failed=0 unreachable=0`). Full results in
`devops/docs/DEVOPS_ASSIGNMENT.md` → "Final successful result".
