terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # ── State: intentionally local, intentionally NOT shared with devops/terraform ──
  # This directory is its own Terraform root module. Running `terraform init`
  # here creates devops/terraform-assignment/terraform.tfstate — a completely
  # separate file from devops/terraform/terraform.tfstate (production). No
  # backend block is defined, so there is no way for this module to read or
  # write the production state by accident.
  #
  # If you later want remote state for the assignment environment too, use a
  # distinct key, e.g.:
  #
  # backend "s3" {
  #   bucket = "your-terraform-state-bucket"
  #   key    = "techvault/assignment/terraform.tfstate"   # NOT "techvault/terraform.tfstate"
  #   region = "eu-central-1"
  # }
}

provider "aws" {
  region = var.aws_region

  # Credentials are resolved in this order (never hardcode them here):
  #   1. Environment variables AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY  ← Jenkins
  #   2. ~/.aws/credentials                                                ← local dev
  #   3. EC2 instance IAM role                                             ← if running on AWS

  default_tags {
    tags = {
      Environment = var.environment_name
      Project     = var.app_name
      ManagedBy   = "terraform-assignment"
    }
  }
}
