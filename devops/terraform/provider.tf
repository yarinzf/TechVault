terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # ── Remote state (recommended for CI) ────────────────────────────────────────
  # Uncomment and fill in your bucket name to store state in S3.
  # Create the bucket manually first; Terraform cannot create its own state bucket.
  #
  # backend "s3" {
  #   bucket = "your-terraform-state-bucket"
  #   key    = "techvault/terraform.tfstate"
  #   region = "us-east-1"
  # }
}

provider "aws" {
  region = var.aws_region

  # Credentials are resolved in this order (never hardcode them here):
  #   1. Environment variables AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY  ← Jenkins
  #   2. ~/.aws/credentials                                                ← local dev
  #   3. EC2 instance IAM role                                             ← if running on AWS
}
