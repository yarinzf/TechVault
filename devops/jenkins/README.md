# Jenkins — host plan and access model

This document describes how to stand up Jenkins for the DevOps assignment.
**Nothing here has been installed yet** — this is a plan to execute later,
deliberately, not something this repository's tooling does automatically.

## Two files, two purposes

| File | Targets | Status |
|---|---|---|
| `Jenkinsfile` | Production (`devops/terraform/`, `devops/ansible/`) | Pipeline-as-code exists; no evidence it has ever run |
| `Jenkinsfile.assignment` | The isolated assignment environment (`devops/terraform-assignment/`, `devops/ansible-assignment/`) | New — this is the one to actually run for grading |

## Where should Jenkins itself live?

### Option A — Dedicated Jenkins host, separate from the assignment app server (recommended)

A small, persistent EC2 instance runs Jenkins only. It provisions and
deploys to the assignment application instance created by
`devops/terraform-assignment/`, over SSH, the same way your workstation
would.

**Why this is the recommended option:** the assignment app instance is
meant to be disposable — created, redeployed, and eventually `terraform
destroy`'d as part of normal iteration and cleanup. If Jenkins lived on that
same disposable instance, destroying the environment would also destroy
Jenkins itself — its job history, its credentials store, its configuration —
which then requires reinstalling and reconfiguring Jenkins (including the
instructor's user and permissions) before you could even run another build.
Keeping the controller on a separate, stable host means the assignment app
instance can be torn down and recreated freely without ever touching the
thing that manages it.

### Option B — Jenkins co-located on the assignment app instance

Jenkins runs directly on the same instance that also runs the TechVault
containers. `devops/terraform-assignment/variables.tf` supports this via
`enable_jenkins_port = true` (opens a configurable port, default 8080, to a
configurable CIDR).

Simpler to stand up (one instance total), but every `terraform destroy` /
recreate cycle for the app also takes Jenkins down with it, and Jenkins ends
up sharing resources (CPU/RAM/disk) with the containers it's supposed to be
deploying.

**Recommendation: Option A.** The cost difference is one extra small EC2
instance (see cost note in `devops/docs/DEVOPS_ASSIGNMENT.md`), which is
worth it for not coupling Jenkins's lifecycle to the thing it's grading.

## Required plugins

- Pipeline (Declarative)
- Git
- Credentials Binding
- AWS Credentials (for `AmazonWebServicesCredentialsBinding`)
- SSH Agent / SSH Credentials (for `sshUserPrivateKey`)
- Role-Based Authorization Strategy
- AnsiColor
- Timestamper

## Required credentials (IDs only — no values here)

See the header comment in `Jenkinsfile.assignment` for the authoritative
list: `AWS_ASSIGNMENT_CREDENTIALS_ID`, `SSH_ASSIGNMENT_KEY_CREDENTIALS_ID`,
`TECHVAULT_ASSIGNMENT_JWT_ACCESS_SECRET`,
`TECHVAULT_ASSIGNMENT_JWT_REFRESH_SECRET`,
`TECHVAULT_ASSIGNMENT_COOKIE_SECRET`, plus two optional ones (Google OAuth
client ID, private-repo credentials) only if actually needed.

## Required job parameters (not secrets — set at "Build with Parameters")

`devops/terraform-assignment/variables.tf` requires `key_pair_name` and
`allowed_ssh_cidr` with **no default**, by design (see that file's
comments). A freshly-cloned Jenkins workspace has no committed
`terraform.tfvars` — it's gitignored — so those two values have to come from
somewhere else. `Jenkinsfile.assignment` exposes them as job parameters and
passes them straight through to `terraform plan -var=...`:

| Parameter | Default | Notes |
|---|---|---|
| `ASSIGNMENT_KEY_PAIR_NAME` | *(none)* | **Required.** The "Validate Project" stage fails the build immediately, with a clear message, if this is blank or equals `techvault-key` |
| `ASSIGNMENT_SSH_CIDR` | *(none)* | **Required.** Same stage fails the build if this is blank, equals `0.0.0.0/0`, has no `/prefix`, has a prefix outside 0-32, or has an IPv4 octet outside 0-255 — a real CIDR check, not just a regex shape match |
| `ASSIGNMENT_AWS_REGION` | `eu-central-1` | Safe to leave as-is |
| `ASSIGNMENT_INSTANCE_TYPE` | `t3.small` | Safe to leave as-is |

Because a Jenkins string parameter's `defaultValue` can't enforce
"mandatory," the pipeline treats a blank/unsafe value as a hard failure
during "Validate Project" (stage 2) rather than letting `terraform plan`
fail later with a less clear "no value for required variable" error.

## Instructor user and permission model

1. Install the **Role-Based Authorization Strategy** plugin.
2. Create a dedicated Jenkins user for the instructor (their own login, not
   a shared account).
3. Create a role scoped to the single assignment pipeline job, granting only:
   - `Overall/Read`
   - `Job/Read`
   - `Job/Build`
   - `Job/Workspace` (if they need to inspect build artifacts/logs directly)
4. Explicitly do **not** grant:
   - `Overall/Administer`
   - Any `Credentials` permission
   - Node/agent administration
   - Plugin administration
5. Verify by logging in as that account and confirming "Manage Jenkins" is
   not reachable, and no job other than the assignment pipeline is visible
   or runnable.

## AWS IAM — assignment-scoped credentials, not AdministratorAccess

`AWS_ASSIGNMENT_CREDENTIALS_ID` should point to a **dedicated IAM user (or
role) created only for this assignment pipeline** — never the broad
production deployment credentials, and never `AdministratorAccess`.

This is a permission **outline**, not a validated, ready-to-paste IAM policy
— review and tighten it in the AWS console for your account before use.
Account IDs, ARNs, and any real credential values are deliberately omitted.

**Permission categories actually needed** by `devops/terraform-assignment/`
(one EC2 instance + one security group, nothing else):

| Category | Example actions | Why |
|---|---|---|
| Instance lifecycle | `ec2:RunInstances`, `ec2:TerminateInstances` | Create/destroy the assignment EC2 instance |
| Read/inspect | `ec2:Describe*` | Terraform refresh/plan needs to read instance, AMI, key-pair, and SG state |
| Security group lifecycle | `ec2:CreateSecurityGroup`, `ec2:DeleteSecurityGroup`, `ec2:AuthorizeSecurityGroupIngress`, `ec2:RevokeSecurityGroupIngress` | Create/update/destroy the assignment security group |
| Tagging | `ec2:CreateTags` | Tag resources with `Environment=devops-assignment` |
| Key pairs / AMIs (read-only) | `ec2:DescribeKeyPairs`, `ec2:DescribeImages` | `variables.tf` references an existing key pair by name and looks up the latest Ubuntu AMI via `data.aws_ami` — both are read-only lookups, no key-pair or AMI *creation* permission is needed |

**Scoping guidance:**
- Restrict to a single region (e.g. `eu-central-1`) via an IAM policy
  `Condition` on `aws:RequestedRegion`, where practical — this module never
  needs to act outside one region.
- Where AWS supports resource-level tag conditions for the action in
  question (EC2's tag-based conditions are inconsistent across actions —
  verify per-action in the AWS IAM reference before relying on this), scope
  write actions to resources tagged `Environment=devops-assignment` so the
  credential physically cannot touch anything else, including the
  production instance.
- Do not reuse this credential for anything outside the assignment
  pipeline, and do not reuse the production deployment credential here —
  keeping them separate means either one can be rotated or revoked without
  affecting the other.
- No AWS secret values (access key, secret key) belong in this repository
  at any path, committed or not — they live only in Jenkins credentials
  (`AWS_ASSIGNMENT_CREDENTIALS_ID`) or a local, gitignored AWS profile.

## Public URL and HTTPS

Whichever option (A or B) is chosen, Jenkins needs its own public URL,
separate from `https://techvault.co.il`:

- Put a reverse proxy (Nginx, same pattern as `devops/nginx/techvault.conf`)
  in front of Jenkins's default port (8080), with its own Let's Encrypt
  certificate for a distinct (sub)domain, e.g. `jenkins.<your-domain>`.
- Open only that proxy's port (443) to the internet; keep Jenkins's raw port
  bound to `127.0.0.1` or restricted to the proxy host if co-located.
