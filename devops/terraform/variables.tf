variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "instance_type" {
  description = "EC2 instance type. t3.small (2 vCPU / 2 GB) is the minimum for 3 Docker containers. t3.medium recommended for comfort."
  type        = string
  default     = "t3.small"
}

variable "key_pair_name" {
  description = "Name of an existing AWS EC2 key pair. Create one in the AWS console and download the .pem file before running terraform apply."
  type        = string
}

variable "allowed_ssh_cidr" {
  description = "CIDR block allowed to reach port 22 (SSH). Use YOUR_IP/32 for a single host. Default 0.0.0.0/0 is open to the world — acceptable for a class assignment, but restrict in production."
  type        = string
  default     = "0.0.0.0/0"
}

variable "app_name" {
  description = "Short name used as a tag prefix on all AWS resources"
  type        = string
  default     = "techvault"
}

variable "volume_size_gb" {
  description = "Root EBS volume size in GB. 20 GB is enough for Docker images and MongoDB data for a class project."
  type        = number
  default     = 20
}
