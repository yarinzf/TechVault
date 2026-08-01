# Terraform — DevOps assignment environment

This directory is a **separate Terraform root module**, independent of
[`devops/terraform/`](../terraform/) (production). It creates one disposable
EC2 instance + security group for the assignment pipeline to deploy to.

## Why a separate directory, not a `-state=` flag

An earlier draft of this plan considered running the assignment against the
same `devops/terraform/` config with a `-state=terraform-assignment.tfstate`
override on `plan`/`apply`. That pattern turned out to be unsafe to recommend:

- `terraform init` does not accept a `-state` flag at all — there is no way
  to make init/plan/apply agree on a state path through that flag alone.
- `-state` is a legacy, local-backend-only override that several Terraform
  subcommands have deprecated at different times. Relying on every future
  invocation remembering to pass it correctly is exactly the kind of
  "one forgotten flag away from touching production" risk this whole
  exercise exists to eliminate.

A **separate root module directory** avoids the problem structurally instead
of procedurally: `devops/terraform-assignment/` gets its own `.terraform/`
and its own local `terraform.tfstate` the moment you run `terraform init`
here, simply because it's a different working directory. There is no flag to
forget. This module also has no `key_pair_name` default, no way to reference
`i-0d68157135a96965d`, and no `terraform_remote_state` data source pointing
at production — see the comment block at the top of `variables.tf`.

## Files

| File | Purpose |
|---|---|
| `provider.tf` | AWS provider, version constraints, local-state note |
| `variables.tf` | All inputs, with validation blocks rejecting production-like values |
| `main.tf` | Security group + EC2 instance, with `lifecycle.precondition` safeguards |
| `outputs.tf` | Instance ID, IPs, SSH command, frontend/health/Jenkins URLs |
| `terraform.tfvars.example` | Copy → `terraform.tfvars` (gitignored) and fill in |

## SSH access

`aws_security_group.assignment`'s SSH ingress rule (`main.tf`) allows **two**
CIDRs, not one:

1. `var.allowed_ssh_cidr` — the operator's own current public IP, passed in
   as the `ASSIGNMENT_SSH_CIDR` Jenkins job parameter (or `terraform.tfvars`
   for manual runs). This changes whenever your home/office IP changes —
   check it before every run:
   ```bash
   curl -4 https://checkip.amazonaws.com
   ```
   and use `<that-ip>/32` as the value.
2. `3.68.18.214/32`, hardcoded directly in `main.tf` — the Jenkins host's
   own IP. This is **not** controlled by `allowed_ssh_cidr` and is always
   present, because `devops/ansible-assignment/deploy.yml` runs as an SSH
   client *from* the Jenkins host during the "Ansible Deploy" stage; without
   it, every pipeline run would fail at that stage regardless of what
   `ASSIGNMENT_SSH_CIDR` is set to (this was Known Issue #3 during initial
   implementation — see `devops/docs/DEVOPS_ASSIGNMENT.md` "Known issues and
   fixes").

Because these two rules are independent, a stale `allowed_ssh_cidr` /
`ASSIGNMENT_SSH_CIDR` does **not** break the pipeline itself — the Jenkins
host's own rule is unaffected, and Ansible connects from that host, so
"Ansible Deploy" still succeeds. A stale value only costs the *operator*
their own direct SSH access to the instance from their own machine; check
and update it before each run so direct access stays available.

`0.0.0.0/0` is rejected before it ever reaches Terraform: when run via
Jenkins, `Jenkinsfile.assignment`'s "Validate Project" stage (stage 2) fails
the build outright if `ASSIGNMENT_SSH_CIDR` equals `0.0.0.0/0`. This
module's own `variables.tf` validation only checks that `allowed_ssh_cidr`
is a *syntactically valid* CIDR (`can(cidrhost(...))`) — it does not itself
reject `0.0.0.0/0` — so a manual `terraform apply` (bypassing Jenkins) is
not protected by that guard; the variable's description warns against it
in that case, but nothing enforces it at the Terraform layer.

## Safe command sequence (not run automatically — for your reference)

```bash
cd devops/terraform-assignment
cp terraform.tfvars.example terraform.tfvars   # fill in key_pair_name, allowed_ssh_cidr
terraform init
terraform validate
terraform plan             # review carefully — should only show resources to CREATE
terraform apply             # only after reviewing the plan
```

Every command above operates purely within this directory's own state.
Nothing here touches `devops/terraform/terraform.tfstate`.

## Destroy (assignment only)

```bash
cd devops/terraform-assignment
terraform destroy
```

This can only ever destroy resources tracked in *this* directory's state —
the assignment instance and its security group. It has no path to the
production instance.

## What this module deliberately does not do

- Does not open an application port (3000/5000) directly — Nginx (installed
  by `devops/ansible-assignment/`) is the only public path to the app.
- Does not expose Jenkins by default (`enable_jenkins_port = false`). See
  [`devops/jenkins/README.md`](../jenkins/README.md) for the recommended
  topology.
- Does not configure TLS/Route53 — `app_domain` is optional and only affects
  output URLs and the Nginx `server_name`; obtaining a real certificate is a
  manual, later step (see `devops/ansible-assignment/README.md`).
