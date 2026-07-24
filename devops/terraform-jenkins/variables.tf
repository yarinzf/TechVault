# ─────────────────────────────────────────────────────────────────────────────
# TechVault — Jenkins HOST environment variables
#
# Design property (read before adding variables):
#   This module has NO variable that accepts an existing AWS instance ID, no
#   `terraform_remote_state` data source, and no reference to any other
#   module's state. It can only ever create a brand-new instance — it has no
#   mechanism to attach to, import, or otherwise reference the production
#   server (i-0d68157135a96965d), devops/terraform/, or the assignment
#   application server created by devops/terraform-assignment/.
# ─────────────────────────────────────────────────────────────────────────────

variable "environment_name" {
  description = "Short identifier for this disposable Jenkins host. Used as a suffix on every resource name/tag so it can never be mistaken for production."
  type        = string
  default     = "jenkins-assignment"

  validation {
    condition     = !can(regex("(?i)prod", var.environment_name)) && lower(var.environment_name) != "techvault"
    error_message = "environment_name must not reference production (no 'prod' substring, and not the bare app name). Use something like 'jenkins-assignment'."
  }
}

variable "app_name" {
  description = "Short name used as a tag/name prefix on all Jenkins host resources."
  type        = string
  default     = "techvault"
}

variable "aws_region" {
  description = "AWS region for the Jenkins host. Independent of whatever region production or the assignment application happen to run in."
  type        = string
  default     = "eu-central-1"
}

variable "instance_type" {
  description = <<-EOT
    EC2 instance type for the Jenkins host.

    Default is t3.medium (2 vCPU / 4 GB RAM). Jenkins itself, plus Docker,
    Terraform, Ansible, Node/npm, and a concurrent application build (backend
    tests + frontend Vite build + Docker image builds) genuinely need more
    headroom than the 2 GB on a t3.small — t3.medium was chosen to favor
    reliability over the lowest possible cost.

    t3.small (2 vCPU / 2 GB) can work for lower cost, but is more likely to
    hit memory pressure during a concurrent Docker-build + npm-build + Jenkins
    JVM workload — see swap notes in devops/ansible-jenkins/README.md if you
    choose t3.small.
  EOT
  type        = string
  default     = "t3.medium"
}

variable "key_pair_name" {
  description = "Name of an EXISTING AWS EC2 key pair, created specifically for the Jenkins host. Must NOT be the production key pair, and must NOT be whatever key pair name you chose for the assignment application server."
  type        = string

  validation {
    condition     = length(var.key_pair_name) > 0 && var.key_pair_name != "techvault-key"
    error_message = "key_pair_name is required and must not be 'techvault-key' (the production key pair). It must also differ from the assignment application's key pair — this module cannot check that automatically, since it deliberately has no reference to devops/terraform-assignment/'s state or variables; verify it yourself before applying."
  }
}

variable "allowed_ssh_cidr" {
  description = "CIDR allowed to reach port 22. No default is provided on purpose — you must explicitly choose a restricted range (e.g. YOUR_IP/32). Do not set this to 0.0.0.0/0."
  type        = string

  validation {
    condition     = var.allowed_ssh_cidr != "0.0.0.0/0" && can(cidrhost(var.allowed_ssh_cidr, 0))
    error_message = "allowed_ssh_cidr must be a valid, non-world-open CIDR block, e.g. 203.0.113.10/32."
  }
}

variable "volume_size_gb" {
  description = <<-EOT
    Root EBS volume size in GB for the Jenkins host.

    Default is 40 GB — larger than the assignment application server's 20 GB
    default, because the Jenkins home directory accumulates job history and
    build logs, Docker pulls/builds its own image layers, and Terraform/npm
    caches grow over repeated runs, all on the same volume.
  EOT
  type        = number
  default     = 40
}

variable "enable_elastic_ip" {
  description = <<-EOT
    Allocate and associate an Elastic IP for the Jenkins host. Default false.

    Without one, the public IP changes on every stop/start (not on reboot —
    only stop/start), which can break bookmarks, DNS (if jenkins_domain is
    set), and the instructor's saved URL. If you plan to stop this host
    between work sessions to save cost (see "Cost and cleanup" in
    devops/docs/DEVOPS_ASSIGNMENT.md), set this to true so the IP survives
    that. If you plan to leave it running continuously for the life of the
    assignment, the default (false) is simpler and has one fewer resource to
    track and eventually release.
  EOT
  type        = bool
  default     = false
}

variable "jenkins_domain" {
  description = "Optional domain name pointed at the Jenkins host (e.g. jenkins.your-domain.example). Leave empty to reach Jenkins over the bare public IP via HTTP for the first setup. Never set this to techvault.co.il or www.techvault.co.il."
  type        = string
  default     = ""

  validation {
    condition     = !contains(["techvault.co.il", "www.techvault.co.il"], lower(var.jenkins_domain))
    error_message = "jenkins_domain must not be the production domain (techvault.co.il / www.techvault.co.il)."
  }
}
