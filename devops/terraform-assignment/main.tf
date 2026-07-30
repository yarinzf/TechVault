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
# Only SSH (restricted) + HTTP/HTTPS are open by default. Unlike the production
# config, no application container port (3000/5000) is exposed directly —
# devops/ansible-assignment/ provisions a host-level Nginx reverse proxy in
# front of the app, so 80/443 is the only public path into the stack.
resource "aws_security_group" "assignment" {
  name        = "${var.app_name}-${var.environment_name}-sg"
  description = "TechVault DevOps assignment (${var.environment_name}) - isolated from production"

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.allowed_ssh_cidr]
  }

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  dynamic "ingress" {
    for_each = var.enable_jenkins_port ? [1] : []
    content {
      description = "Jenkins (co-located mode only — see devops/jenkins/README.md)"
      from_port   = var.jenkins_port
      to_port     = var.jenkins_port
      protocol    = "tcp"
      cidr_blocks = [var.allowed_jenkins_cidr]
    }
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
resource "aws_instance" "assignment" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = var.key_pair_name
  vpc_security_group_ids = [aws_security_group.assignment.id]

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
