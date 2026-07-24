# ─────────────────────────────────────────────────────────────────────────────
# TechVault — DevOps ASSIGNMENT environment variables
#
# Design property (read before adding variables):
#   This module has NO variable that accepts an existing AWS instance ID,
#   an existing state file, or a `terraform_remote_state` data source.
#   It can only ever create a brand-new instance — it has no mechanism to
#   attach to, import, or otherwise reference the production server
#   (i-0d68157135a96965d) or the production state in devops/terraform/.
# ─────────────────────────────────────────────────────────────────────────────

variable "environment_name" {
  description = "Short identifier for this disposable assignment environment. Used as a suffix on every resource name/tag so it can never be mistaken for production."
  type        = string
  default     = "devops-assignment"

  validation {
    condition     = !can(regex("(?i)prod", var.environment_name)) && lower(var.environment_name) != "techvault"
    error_message = "environment_name must not reference production (no 'prod' substring, and not the bare app name). Use something like 'devops-assignment'."
  }
}

variable "app_name" {
  description = "Short name used as a tag/name prefix on all assignment resources."
  type        = string
  default     = "techvault"
}

variable "aws_region" {
  description = "AWS region for the assignment environment. Independent of whatever region production happens to run in."
  type        = string
  default     = "eu-central-1"
}

variable "instance_type" {
  description = "EC2 instance type for the assignment target. t3.small (2 vCPU / 2 GB) is the minimum for 3 Docker containers."
  type        = string
  default     = "t3.small"
}

variable "key_pair_name" {
  description = "Name of an EXISTING AWS EC2 key pair, created specifically for this assignment. Must NOT be the production key pair."
  type        = string

  validation {
    condition     = var.key_pair_name != "techvault-key"
    error_message = "key_pair_name must not be 'techvault-key' — that is the production key pair. Create a new, dedicated key pair for the assignment environment."
  }
}

variable "allowed_ssh_cidr" {
  description = "CIDR allowed to reach port 22. No default is provided on purpose — you must explicitly choose a restricted range (e.g. YOUR_IP/32). Do not set this to 0.0.0.0/0 outside of a deliberate, documented grading window."
  type        = string

  validation {
    condition     = can(cidrhost(var.allowed_ssh_cidr, 0))
    error_message = "allowed_ssh_cidr must be a valid CIDR block, e.g. 203.0.113.10/32."
  }
}

variable "volume_size_gb" {
  description = "Root EBS volume size in GB."
  type        = number
  default     = 20
}

variable "app_domain" {
  description = "Optional domain name pointed at the assignment instance (e.g. assignment.techvault.co.il or a throwaway domain). Leave empty to use the bare public IP over HTTP — this is the default, first-run mode. Never set this to techvault.co.il or www.techvault.co.il."
  type        = string
  default     = ""

  validation {
    condition     = !contains(["techvault.co.il", "www.techvault.co.il"], lower(var.app_domain))
    error_message = "app_domain must not be the production domain (techvault.co.il / www.techvault.co.il)."
  }
}

# ── Jenkins ingress (opt-in) ──────────────────────────────────────────────────
# The assignment requires Jenkins to be reachable from the internet. That does
# NOT have to be this instance's security group — see devops/jenkins/README.md
# for the recommended topology (a separate, persistent Jenkins host). These
# variables exist only for the case where Jenkins is deliberately co-located
# on the same instance this module creates (Option B in that doc).

variable "enable_jenkins_port" {
  description = "Open a Jenkins ingress rule on THIS instance's security group. Leave false if Jenkins runs on a separate host (recommended — see devops/jenkins/README.md)."
  type        = bool
  default     = false
}

variable "jenkins_port" {
  description = "TCP port Jenkins listens on, only relevant when enable_jenkins_port = true."
  type        = number
  default     = 8080
}

variable "allowed_jenkins_cidr" {
  description = "CIDR allowed to reach the Jenkins port, only relevant when enable_jenkins_port = true. Restrict this to the instructor/grader's IP range where possible; document any use of 0.0.0.0/0."
  type        = string
  default     = "0.0.0.0/0"
}
