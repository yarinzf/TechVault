# Jenkins — host plan and access model

This document describes how Jenkins was stood up for the DevOps assignment.
**Status: live and complete.** The dedicated Jenkins EC2 host described below
exists, is reachable at `http://3.68.18.214/`, and has run the assignment
pipeline (`Jenkinsfile.assignment`) to a full green result — **Build #8 —
SUCCESS**, all stages passed. The "Complete setup sequence" section below is
kept as a historical/reference record of how the host was built, not a
pending to-do list.

## Three files, three purposes

| File | Targets | Status |
|---|---|---|
| `Jenkinsfile` | Production (`devops/terraform/`, `devops/ansible/`) | Pipeline-as-code exists; no evidence it has ever run |
| `Jenkinsfile.assignment` | The isolated assignment environment (`devops/terraform-assignment/`, `devops/ansible-assignment/`) | **Live and proven** — last successful run: Build #8, all 15 stages green |
| *(this Jenkins host itself)* | `devops/terraform-jenkins/` + `devops/ansible-jenkins/` | **Live** — `techvault-jenkins-assignment-server` (t3.small, Elastic IP `3.68.18.214`), provisioned and running |

## Jenkins host architecture — Option A, now implemented as code

**Option A — a dedicated Jenkins EC2, separate from both production and the
assignment application server — is the architecture implemented here**, via
[`devops/terraform-jenkins/`](../terraform-jenkins/) (its own Terraform root
module, own state, own key pair, own security group) and
[`devops/ansible-jenkins/`](../ansible-jenkins/) (provisions Jenkins, Docker,
Node.js, Terraform, and Ansible onto that instance).

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

### Option B — Jenkins co-located on the assignment app instance (alternative, not implemented here)

Jenkins would run directly on the same instance that also runs the
TechVault containers. `devops/terraform-assignment/variables.tf` still
supports the wiring for this via `enable_jenkins_port` (opens a configurable
port, default `false`, to a configurable CIDR) — but no Ansible tasks exist
anywhere in this repository to actually install Jenkins onto that instance;
choosing Option B would mean writing that provisioning yourself, reusing
`devops/ansible-jenkins/provision.yml`'s Jenkins/Java/Nginx tasks as a
starting point against the assignment app's inventory group instead.

Simpler to stand up (one instance total), but every `terraform destroy` /
recreate cycle for the app also takes Jenkins down with it, and Jenkins ends
up sharing resources (CPU/RAM/disk) with the containers it's supposed to be
deploying.

**Recommendation stands: Option A.** The cost difference is one extra EC2
instance (see "Cost and cleanup" in `devops/docs/DEVOPS_ASSIGNMENT.md`),
which is worth it for not coupling Jenkins's lifecycle to the thing it's
grading.

## Complete setup sequence (historical record — already completed for the live host)

1. Create a dedicated Jenkins AWS key pair in the EC2 console (must not be
   `techvault-key` or the assignment app's key pair).
2. `cd devops/terraform-jenkins && cp terraform.tfvars.example terraform.tfvars`
   — fill in `key_pair_name`, `allowed_ssh_cidr` (gitignored, never commit).
3. `terraform init && terraform validate && terraform plan && terraform apply`
   in `devops/terraform-jenkins/`.
4. Generate `devops/ansible-jenkins/inventory.ini` from
   `terraform output -raw jenkins_public_ip` (gitignored — see
   `inventory.example.ini` for the format).
5. `ansible-playbook -i inventory.ini provision.yml` from
   `devops/ansible-jenkins/`.
6. Open `http://<jenkins-public-ip>/` in a browser (port 80, via Nginx —
   port 8080 is never publicly reachable).
7. Retrieve the initial admin password:
   `ssh ... sudo cat /var/lib/jenkins/secrets/initialAdminPassword`.
8. Complete the setup wizard (paste the password).
9. Install the required plugins (list below) and create the first admin
   account.
10. Add the assignment credentials (list below) under Manage Jenkins →
    Credentials.
11. Create the pipeline job — Definition: "Pipeline script from SCM", Script
    Path: `devops/jenkins/Jenkinsfile.assignment`.
12. Add the job parameters (`ASSIGNMENT_KEY_PAIR_NAME`, `ASSIGNMENT_SSH_CIDR`,
    etc. — see "Required job parameters" below; Jenkins reads these from the
    `parameters {}` block in the Jenkinsfile itself once the job is created).
13. Create the instructor user and role (see "Instructor user and permission
    model" below).
14. Test login as the instructor account — confirm no admin access.
15. Run the pipeline.

## Required tools on the Jenkins host

Installed automatically by `devops/ansible-jenkins/provision.yml` — nothing
to do manually here:

- Git, curl
- Docker Engine + Compose plugin
- Node.js 20+ / npm
- Terraform (>= 1.6, via HashiCorp's apt repository)
- Ansible
- Jenkins itself (via `pkg.jenkins.io`, OpenJDK 17)

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
`ASSIGNMENT_SSH_CIDR = 0.0.0.0/0` is one of the values that stage rejects
outright — it is not a soft warning, the build stops.

### Before every "Build with Parameters" run: check your current public IP

`ASSIGNMENT_SSH_CIDR` must be *your* current public IPv4 address, and home/
office IPs commonly change between sessions. Check it immediately before
triggering a build:

```bash
curl -4 https://checkip.amazonaws.com
```

Enter the result as `<that-ip>/32` in `ASSIGNMENT_SSH_CIDR`. A stale CIDR
from a previous run does not fail cleanly at the "Validate Project" stage
(the value is still a syntactically valid CIDR), and it does **not** break
the pipeline's own deployment step: `3.68.18.214/32` (the Jenkins host) is
always separately permitted on port 22, regardless of this parameter, and
Ansible connects *from* that host — so "Ansible Deploy" still succeeds even
with a stale `ASSIGNMENT_SSH_CIDR`. What a stale value actually costs you is
your own direct SSH access to the assignment instance from your own
machine, since the security group no longer includes your current IP —
check and update it before each run so direct operator access stays
available. See `devops/terraform-assignment/README.md` "SSH access" for the
full detail.

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

**Evidence on file:** `devops/docs/assignment-screenshots/12-jenkins-lecturer-user-permissions.png`
shows the `DevOps Instructor` account logged in, on the "Build with
Parameters" screen, with no Configure / Delete Pipeline / Manage Jenkins
options exposed anywhere in the UI chrome — this is treated as sufficient
evidence for steps 3-5 above (login works, build access works, admin
surface is absent). No separate role-matrix screenshot is required for
submission.

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

**`devops/terraform-jenkins/` needs the identical permission categories** —
one more EC2 instance + one more security group, nothing else. Either reuse
the same scoped IAM user for both this module and the assignment
application's Terraform (they need the same shape of access), or create a
second, equally-scoped one for stronger separation — both are reasonable;
just never widen the policy to cover more than these two modules need, and
never point either at `AdministratorAccess`.

## Public URL and HTTPS

**Implemented**, not just planned: `devops/terraform-jenkins/` opens 80/443
(never 8080) in its security group, and
`devops/ansible-jenkins/templates/jenkins-nginx.conf.j2` puts Nginx in front
of Jenkins on those ports. Jenkins itself is additionally bound to
`127.0.0.1:8080` via a systemd override — a second, independent layer of
protection, not just a security-group rule — and `provision.yml`'s
validation section actually inspects the live listening socket to prove
that binding is correct, rather than assuming it from configuration alone.
See `devops/ansible-jenkins/README.md` "Jenkins binding mechanism" for the
full detail.

- First setup: reach Jenkins over `http://<jenkins-public-ip>/` — no domain
  required. Note the public IP changes on stop/start unless you enabled an
  Elastic IP (`enable_elastic_ip = true` in `devops/terraform-jenkins/`) —
  see that module's README "Elastic IP decision" before deciding whether to
  ever stop this host.
- **Current live host:** `techvault-jenkins-assignment-server`, instance
  type `t3.small`, with an Elastic IP (`techvault-jenkins-assignment-eip`)
  already allocated and associated — so `http://3.68.18.214/` is stable
  across stop/start for this deployment, not just across plain reboots.
- HTTPS: a deliberate, separate, manual step performed later, once a real
  domain points at the Jenkins host — see
  `devops/ansible-jenkins/README.md` "HTTPS architecture decision" for the
  exact command and its one documented caveat (re-running the playbook
  afterward reverts the manual Certbot edit).
