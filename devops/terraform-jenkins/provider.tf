terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # ── State: intentionally local, intentionally separate from every other
  # module ─────────────────────────────────────────────────────────────────
  # This directory is its own Terraform root module — a third one, alongside
  # devops/terraform/ (production) and devops/terraform-assignment/ (the
  # disposable application server). Running `terraform init` here creates
  # devops/terraform-jenkins/terraform.tfstate — a file distinct from both of
  # the others. No backend block is defined, so there is no way for this
  # module to read or write either other module's state.
  #
  # If you later want remote state for the Jenkins host too, use a distinct
  # key, e.g.:
  #
  # backend "s3" {
  #   bucket = "your-terraform-state-bucket"
  #   key    = "techvault/jenkins/terraform.tfstate"   # NOT "techvault/terraform.tfstate" or ".../assignment/..."
  #   region = "eu-central-1"
  # }
}

provider "aws" {
  region = var.aws_region

  # Credentials are resolved in this order (never hardcode them here):
  #   1. Environment variables AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
  #   2. ~/.aws/credentials                                                ← local dev
  #   3. EC2 instance IAM role                                             ← if running on AWS
  #
  # Use a dedicated, assignment-scoped IAM credential here too — see
  # devops/jenkins/README.md "AWS IAM" section. Do not reuse the production
  # deployment credential for this module.

  default_tags {
    tags = {
      Environment = var.environment_name
      Project     = var.app_name
      ManagedBy   = "terraform-jenkins"
    }
  }
}
