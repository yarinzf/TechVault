# Terraform — Jenkins host

A **third, independent Terraform root module** — alongside
[`devops/terraform/`](../terraform/) (production) and
[`devops/terraform-assignment/`](../terraform-assignment/) (the disposable
application server). Creates one EC2 instance + security group to run
Jenkins on, with its own state, its own key pair, and no reference to either
other module.

## Why a third, separate module

Same reasoning as `devops/terraform-assignment/README.md`, applied again:
`devops/terraform-jenkins/` gets its own `.terraform/` and its own local
`terraform.tfstate` the moment you run `terraform init` here, purely because
it's a different working directory — there's no flag or state-key convention
to remember or get wrong. This module also has no `instance_id` input, no
`terraform_remote_state` data source, and cannot reference the production
instance (`i-0d68157135a96965d`) or the assignment application instance
created by `devops/terraform-assignment/` even by accident.

**Why Jenkins gets its own host at all**, rather than living on the
assignment application instance: see
[`devops/jenkins/README.md`](../jenkins/README.md) — in short, the
assignment application server is meant to be destroyed and recreated freely;
Jenkins should not go down every time that happens.

## Files

| File | Purpose |
|---|---|
| `provider.tf` | AWS provider, version constraints, local-state note |
| `variables.tf` | All inputs, with validation blocks rejecting production-like and cross-environment values |
| `main.tf` | Security group + EC2 instance, with `lifecycle.precondition` safeguards |
| `outputs.tf` | Instance ID, IPs, SSH command, Jenkins HTTP/domain URLs |
| `terraform.tfvars.example` | Copy → `terraform.tfvars` (gitignored) and fill in |

## Instance sizing decision

Default `instance_type` is **`t3.medium`** (2 vCPU / 4 GB RAM), not
`t3.small`. Jenkins's own JVM, plus Docker builds, `npm ci`/`npm run build`,
`terraform`, and `ansible-playbook` all running from the same host —
sometimes concurrently, if a build step shells out while Jenkins itself is
also under load — benefit from the extra headroom. This is a reliability
choice, not the cheapest possible one.

`t3.small` remains an option (set `instance_type = "t3.small"` in your
`tfvars`) if cost matters more than headroom, paired with the swap file that
`devops/ansible-jenkins/provision.yml` can create — see that playbook's
README for the tradeoff.

**Actual deployment:** the current, live `techvault-jenkins-assignment-server`
runs on `t3.small`, not the `t3.medium` default recommended above — a
deliberate cost-conscious choice for this assignment, paired with the
swapfile.

## Storage sizing decision

Default `volume_size_gb` is **40 GB** (vs. 20 GB for the assignment
application server), because a Jenkins host accumulates state over time in a
way a disposable app server doesn't: `/var/lib/jenkins` job history and build
logs, Docker image layers pulled/built by every pipeline run, and
Terraform/npm caches all grow on the same root volume across many runs.

## Jenkins port exposure

- Port 8080 (Jenkins's own default) is **not** opened in the security group
  at all — there is no ingress rule for it.
- `devops/ansible-jenkins/provision.yml` binds Jenkins to `127.0.0.1:8080`
  (defense in depth on top of the security group — see that playbook's
  README for exactly how, and how it's verified at provisioning time) and
  installs an Nginx reverse proxy on 80/443 in front of it.
- Only SSH (restricted to `allowed_ssh_cidr`) and 80/443 are reachable from
  the internet.

## Elastic IP decision

**Default: no Elastic IP** (`enable_elastic_ip = false`). The code to add
one exists (`aws_eip.jenkins`, gated by `count`), but creating it is opt-in.

**The tradeoff:**
- Without an EIP, the instance's public IP changes on every **stop/start**
  (not on a plain reboot — only stop/start). If you stop the Jenkins host
  between work sessions to save cost, the next start gets a new IP, which
  can break your browser bookmark, any DNS record pointed at it
  (`jenkins_domain`), your local `inventory.ini`, and the instructor's saved
  URL.
- With an EIP, the address is stable across stop/start. Both an
  automatically assigned EC2 public IPv4 address and an Elastic IP can incur
  public IPv4 address charges — an Elastic IP is chosen here for address
  *stability*, not as a free alternative to the instance's own public IP.
  Check current AWS pricing for public IPv4 addresses before relying on
  either one for a long-running host, and it's one more resource to remember
  to release during cleanup either way.

**Recommendation:** if you intend to leave the Jenkins host running
continuously for the life of the assignment (simplest — matches "preserve
Jenkins until all screenshots and instructor access are complete" in
`devops/docs/DEVOPS_ASSIGNMENT.md`), the default (no EIP) is fine — the IP
never changes as long as you never stop the instance. If you do want to stop
it between sessions, set `enable_elastic_ip = true` in your `tfvars` first,
*before* the first stop, so the address is already stable when you need it.
Release the Elastic IP (via `terraform destroy` or manually disassociating
it) during final cleanup regardless of which path you took.

**Actual deployment:** the current, live Jenkins host has
`enable_elastic_ip = true` — an Elastic IP (`techvault-jenkins-assignment-eip`)
is allocated and associated, so `3.68.18.214` is stable across stop/start
for this deployment.

**Changing `enable_elastic_ip` later:** flipping it from `false` to `true`
and re-applying allocates and associates a new `aws_eip` resource (the
instance itself is untouched) — `jenkins_public_ip` then switches from
reporting the instance's own public IP to reporting the EIP's address,
which is itself a *new* address, not a promotion of whatever IP the
instance happened to have at the time. Update any bookmarks, DNS records,
or `inventory.ini` after making this change, the same as you would after any
IP change.

## Safe command sequence (not run automatically — for your reference)

```bash
cd devops/terraform-jenkins
cp terraform.tfvars.example terraform.tfvars   # fill in key_pair_name, allowed_ssh_cidr
terraform init
terraform validate
terraform plan              # review carefully — should only show resources to CREATE
terraform apply              # only after reviewing the plan
```

## Destroy

```bash
cd devops/terraform-jenkins
terraform destroy
```

Only ever affects resources in *this* directory's state — the Jenkins host
and its security group. See `devops/docs/DEVOPS_ASSIGNMENT.md` "Cost and
cleanup" for when it's appropriate to do this (generally: keep Jenkins around
until all screenshots/instructor access are done — it's cheaper to leave
running between short work sessions than to lose its configuration).
