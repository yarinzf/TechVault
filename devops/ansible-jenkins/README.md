# Ansible — Jenkins host provisioning

Provisions the disposable EC2 instance created by
[`devops/terraform-jenkins/`](../terraform-jenkins/) with Jenkins, Docker,
Node.js, Terraform, and Ansible — everything `devops/jenkins/Jenkinsfile.assignment`
needs to actually run. Structurally independent from
[`devops/ansible/`](../ansible/) (production) and
[`devops/ansible-assignment/`](../ansible-assignment/) (the application
server) — different directory, different inventory group name
(`jenkins_assignment`), no shared state.

## Files

| File | Purpose |
|---|---|
| `provision.yml` | The playbook |
| `inventory.example.ini` | Copy → `inventory.ini` (gitignored) for manual runs |
| `group_vars/jenkins_assignment.yml` | Non-secret defaults (domain, Node version, swap) |
| `templates/jenkins-nginx.conf.j2` | Renders the Jenkins reverse-proxy site — HTTP-only, always (see below) |

## What it does, in order

1. Installs base packages (git, curl, unzip, jq, Nginx, etc.) and OpenJDK 17
   (Jenkins LTS's minimum required Java version since the 2.426 line — see
   "Java version" below).
2. Installs Jenkins from the official `pkg.jenkins.io` apt repository, using
   the current keyring-based `signed-by` method (not the deprecated
   `apt_key` module/classic trusted keyring).
3. Restricts Jenkins to `127.0.0.1:8080` via **two independent mechanisms**
   — see "Jenkins binding mechanism" below — on top of the security group
   never opening port 8080 at all.
4. Installs Docker Engine + Compose plugin; adds both `ubuntu` and `jenkins`
   to the `docker` group, restarts Jenkins, and verifies the account is
   actually configured with `docker` group membership before continuing
   (see "Docker/Jenkins permission model" below).
5. Installs Node.js 20+ (NodeSource repository), Terraform (HashiCorp
   repository), and Ansible (Ubuntu universe repository) — NodeSource and
   HashiCorp both use the keyring-based `signed-by` method with an explicit
   `gpg --dearmor` step (their own documented installation process; skipping
   the dearmor step is a real, common cause of apt signature failures on a
   fresh host).
6. Creates a swapfile, idempotently, if `create_swap: true` and no swap
   specifically at `/swapfile` is already active (see "Swap decision"
   below).
7. Renders and enables an Nginx reverse-proxy site (HTTP-only — see below),
   validates with `nginx -t` before ever reloading (handler-chained), then
   starts Nginx.
8. Runs a battery of validation tasks that **fail the play** on a real
   problem, not just report one softly — see "Validation" below.

## Java version

Java 17 is supported by the Jenkins package line this playbook currently
targets; `openjdk-17-jdk-headless` installs directly from Ubuntu 22.04's own
repositories (no extra PPA). **This is not a permanent guarantee** — Jenkins'
Java support requirements can and do change between LTS lines. The
validation section's `java -version` check only confirms Java is present and
runnable, not that the version is the one Jenkins currently expects — verify
the current Jenkins Java support policy before a future real provisioning
run if substantial time has passed since this playbook was last used or
reviewed.

## Jenkins binding mechanism

**A single, authoritative mechanism** restricts Jenkins to `127.0.0.1:8080`:
a systemd drop-in override at
`/etc/systemd/system/jenkins.service.d/override.conf`, setting `JENKINS_OPTS`
(and an explicit `PATH`) via systemd's own `Environment=` directive.

Modern Jenkins Debian/Ubuntu installations are systemd-managed, and the
current package reads its extra startup arguments (`--httpListenAddress`,
`--httpPort`, etc.) from the `JENKINS_OPTS` environment variable — this is
the mechanism the systemd-based package actually uses, not the legacy
`/etc/default/jenkins` + `JENKINS_ARGS` convention from the older,
non-systemd init scripts. **`/etc/default/jenkins` is intentionally not
edited by this playbook** — an earlier draft edited both files, which
created ambiguity about which one actually won; keeping a single
configuration source removes that ambiguity entirely.

`systemctl daemon-reload` runs only when the override file actually changes
(Ansible's own change-detection on the `copy` task), and Jenkins restarts
only when either the override-directory or override-file task reports a
change — daemon-reload is defined before the restart handler in the
`handlers:` section, so it always runs first when both are notified
together, regardless of notification order.

**This is not trusted blindly.** The validation section (below) inspects:

- the effective systemd environment (`systemctl show jenkins
  --property=Environment`) — fails unless it contains exactly
  `JENKINS_OPTS=--httpListenAddress=127.0.0.1 --httpPort=8080`
- the merged unit definition (`systemctl cat jenkins`) and effective
  `ExecStart` (`systemctl show jenkins --property=ExecStart`) — registered
  for troubleshooting, not asserted against
- the **live listening socket** (`ss -ltn` on port 8080, via `argv` rather
  than a single command string, to avoid ambiguous shell-like tokenization)
  — fails unless `127.0.0.1:8080` is present, and fails if any wildcard
  listener is present (`0.0.0.0:8080`, `*:8080`, `[::]:8080`, or `:::8080`);
  IPv6 loopback (`::1:8080`) is allowed *in addition* to the required IPv4
  loopback listener, but never required or accepted as a substitute for it

The socket check is authoritative — it's the one that proves the binding is
actually correct on a given host, regardless of what the configuration
*should* produce. The environment/unit inspections are troubleshooting aids
layered on top of it, not a substitute for it.

## Docker/Jenkins permission model

Adding the `jenkins` system user to the `docker` group is **effectively
equivalent to giving Jenkins root on this host** — the Docker socket has no
privilege separation of its own; anything that can start a container can
mount the host filesystem and act as root through it. This is the standard
tradeoff every "Jenkins can build Docker images" setup makes, not something
specific to this playbook. It's accepted here because:

- This host runs nothing except this Jenkins instance — there's no other
  workload for a compromised Jenkins to pivot to.
- Access to Jenkins itself is already gated by the instructor role model in
  [`devops/jenkins/README.md`](../jenkins/README.md) (no `Overall/Administer`
  for the instructor account).

Do not repurpose this host for anything beyond running this Jenkins
instance.

**Sequencing:** the group-membership change, an explicit `meta:
flush_handlers` (so the pending Jenkins restart runs immediately rather than
waiting for a later, incidental flush point), and a verification task
(`id jenkins`, asserting `docker` appears in its group list) all happen
together, in that order, before the playbook moves on — group membership for
a systemd service is re-evaluated fresh at process start, so restarting
*after* the group change is what makes the *running* Jenkins process pick it
up, not just the account's static configuration.

## Swap decision

`create_swap: true` by default, idempotent — it checks `swapon --show` for
`/swapfile` **specifically** (not "is any swap active at all") and only
creates/formats/activates it if that exact path isn't already active; never
reformats an already-active swapfile. Checking for the specific path, rather
than any swap, means `create_swap: true` still does the right thing even if
some unrelated swap already exists (e.g. a customized AMI with a swap
partition) — the stated intent ("ensure our swapfile exists") is what gets
honored, not "ensure some swap, whatever it is, exists."

**Known limitation:** changing `swap_size_mb` after the first successful run
has no effect on an already-created `/swapfile` (the `fallocate` step is
skipped via `creates: /swapfile`) — delete it manually first if you need to
resize it. Resizing idempotently in-place was judged not worth the added
complexity for this use case.

This pairs with the instance-sizing tradeoff documented in
`devops/terraform-jenkins/README.md`: recommended `t3.medium` (4 GB RAM) has
comfortable headroom on its own, but the swap file is cheap insurance for
whichever size you choose, especially if you opt for `t3.small` (2 GB) to
save cost — set `create_swap: true` (the default) either way.

## HTTPS architecture decision

**This playbook is HTTP-only, always, by design — the same decision and the
same reasoning as `devops/ansible-assignment/`'s Nginx template.**
`jenkins-nginx.conf.j2` has no HTTPS branch and never references a
certificate path, so it can never fail to start Nginx because a cert doesn't
exist yet.

### Adding HTTPS manually, later (not run by this playbook)

```bash
ssh -i ~/.ssh/techvault-jenkins-key.pem ubuntu@<jenkins-ip>
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d jenkins.your-domain.example --agree-tos -m you@example.com
```

Same caveat as the assignment application server: `certbot --nginx` edits
`/etc/nginx/sites-enabled/jenkins` in place, and **re-running `provision.yml`
afterward will overwrite that edit**, reverting to HTTP-only. Either don't
re-run the playbook after manually enabling HTTPS, or treat this as a known,
documented limitation for a future iteration. The HTTP template already
reserves `location /.well-known/acme-challenge/` pointing at
`/var/www/certbot` for a future webroot-based flow.

## Validation

Near the end of the play, before the summary, a battery of checks runs —
each with `changed_when: false` (they're checks, not changes), and each one
**fails the play** on a real problem rather than reporting it softly:

- `java -version`, `git --version`, `docker --version`,
  `docker compose version`, `node --version`, `npm --version`,
  `terraform version`, `ansible-playbook --version` — confirms every tool
  the Jenkins pipeline needs is actually installed and runnable.
- `sudo -u jenkins bash -lc 'which git curl docker terraform ansible-playbook node npm'`
  — confirms the `jenkins` service account specifically can resolve every
  tool, not just that `ubuntu` can (a command being installed doesn't prove
  every account can find it — see "Jenkins binding mechanism" for the
  related explicit `PATH=` set in the systemd override).
- `systemctl is-active jenkins` / `systemctl is-active nginx` — confirms
  both services are actually running, not just installed.
- `ss -tln` on port 8080 — confirms Jenkins is bound to `127.0.0.1:8080`
  specifically, and fails if `0.0.0.0:8080` or `*:8080` appears instead.
- `nginx -t` — confirms the rendered config is valid (in addition to the
  handler-chained check that already runs before every reload).
- An HTTP request to `http://localhost/` (through Nginx) — retried for up to
  ~2 minutes, accepting `200` or `403` as proof Jenkins is actually serving
  through the proxy (Jenkins can return either depending on exact state
  before the setup wizard is completed; either one proves connectivity,
  which is what this check is for — it does not inspect the response body).

## Jenkins initial setup (manual — not automated)

This playbook deliberately does **not** automate the Jenkins setup wizard,
admin account creation, or instructor credentials — only a Configuration-as-
Code approach with secrets supplied externally would be safe to automate,
and that's a deliberate future step, not this one.

1. Retrieve the initial admin password:
   ```bash
   ssh -i ~/.ssh/techvault-jenkins-key.pem ubuntu@<jenkins-ip>
   sudo cat /var/lib/jenkins/secrets/initialAdminPassword
   ```
2. Open `http://<jenkins-ip>/` in a browser (port 80, via the Nginx proxy —
   port 8080 is not reachable directly).
3. Paste the password to unlock Jenkins.
4. Install the required plugins (see `devops/jenkins/README.md` for the
   exact list) — choose "Select plugins to install" if you want to skip the
   suggested-plugins default set and match the list exactly.
5. Create the first admin account (this is Jenkins's own built-in admin —
   keep its credentials separate from the instructor account created later).
6. Continue with `devops/jenkins/README.md` steps 10 onward: add assignment
   credentials, create the pipeline job, create the instructor's
   restricted-role user.

## Running manually

```bash
cd devops/ansible-jenkins
cp inventory.example.ini inventory.ini   # fill in the Jenkins host IP + key path
ansible-playbook -i inventory.ini provision.yml
```

## Safety

The first task in the play (`assert: 'jenkins_assignment' in group_names`)
refuses to run at all unless the target host is in the `jenkins_assignment`
inventory group — a guard against ever pointing this playbook at
`devops/ansible/inventory.ini` or `devops/ansible-assignment/inventory.ini`
by accident.
