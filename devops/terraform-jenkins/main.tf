# ── AMI — latest Ubuntu 22.04 LTS (Canonical official account) ───────────────
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# ── Security Group ────────────────────────────────────────────────────────────
# SSH (restricted) + HTTP/HTTPS only. Jenkins's own port 8080 is deliberately
# NOT opened here — devops/ansible-jenkins/ binds Jenkins to 127.0.0.1:8080
# and puts host Nginx in front of it on 80/443, so 8080 is never reachable
# from the internet, by construction, regardless of what's running on the box.
resource "aws_security_group" "jenkins" {
  name        = "${var.app_name}-${var.environment_name}-sg"
  description = "TechVault Jenkins host (${var.environment_name}) — isolated from production and from the assignment application server"

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.allowed_ssh_cidr]
  }

  ingress {
    description = "HTTP (Nginx → Jenkins reverse proxy)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS (Nginx → Jenkins reverse proxy, once a cert exists)"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.app_name}-${var.environment_name}-sg"
  }
}

# ── EC2 Instance ──────────────────────────────────────────────────────────────
resource "aws_instance" "jenkins" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = var.key_pair_name
  vpc_security_group_ids = [aws_security_group.jenkins.id]

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.volume_size_gb
    delete_on_termination = true
  }

  tags = {
    Name = "${var.app_name}-${var.environment_name}-server"
  }

  # Defense in depth, on top of the variable-level validations in variables.tf:
  # refuse to plan/apply at all if the inputs drifted toward anything
  # resembling production.
  lifecycle {
    precondition {
      condition     = var.key_pair_name != "techvault-key"
      error_message = "Refusing to plan: key_pair_name matches the production key pair."
    }
    precondition {
      condition     = !can(regex("(?i)prod", var.environment_name))
      error_message = "Refusing to plan: environment_name resembles production."
    }
  }
}

# ── Elastic IP (optional — see variables.tf for the tradeoff) ────────────────
# Off by default. See devops/terraform-jenkins/README.md "Elastic IP decision"
# for the full reasoning: without one, the public IP changes on stop/start.
resource "aws_eip" "jenkins" {
  count    = var.enable_elastic_ip ? 1 : 0
  instance = aws_instance.jenkins.id
  domain   = "vpc"

  tags = {
    Name = "${var.app_name}-${var.environment_name}-eip"
  }
}
