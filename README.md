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
| [`devops/terraform-assignment/README.md`](devops/terraform-assignment/README.md) | Assignment Terraform module — state isolation, safe commands |
| [`devops/ansible-assignment/README.md`](devops/ansible-assignment/README.md) | Assignment Ansible playbook — TLS modes, secrets, safety gate |
| [`devops/jenkins/README.md`](devops/jenkins/README.md) | Jenkins host plan, plugins, instructor permission model |

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
of the Terraform/Ansible/Jenkins pipeline described below — see
`devops/docs/DEVOPS_ASSIGNMENT.md` for the full picture, including why a
second, fully isolated environment exists purely for the assignment
pipeline and is never allowed to touch the production server.
