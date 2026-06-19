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
# Uses the default VPC — no VPC/subnet resources needed for a class project.
resource "aws_security_group" "techvault" {
  name        = "${var.app_name}-sg"
  description = "TechVault: SSH + frontend + backend API"

  # SSH — restricted to operator IP
  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.allowed_ssh_cidr]
  }

  # React/Nginx frontend (docker-compose maps container :80 → host :3000)
  ingress {
    description = "Frontend"
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Express backend API (direct access — useful for debugging)
  ingress {
    description = "Backend API"
    from_port   = 5000
    to_port     = 5000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # All outbound — needed for apt-get, docker pull, npm install, etc.
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name    = "${var.app_name}-sg"
    Project = var.app_name
  }
}

# ── EC2 Instance ──────────────────────────────────────────────────────────────
resource "aws_instance" "techvault" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = var.key_pair_name
  vpc_security_group_ids = [aws_security_group.techvault.id]

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.volume_size_gb
    delete_on_termination = true
  }

  tags = {
    Name    = "${var.app_name}-server"
    Project = var.app_name
  }
}
