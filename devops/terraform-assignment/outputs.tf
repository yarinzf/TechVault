output "assignment_instance_id" {
  description = "EC2 instance ID of the assignment server"
  value       = aws_instance.assignment.id
}

output "assignment_public_ip" {
  description = "Public IP address of the assignment server"
  value       = aws_instance.assignment.public_ip
}

output "assignment_public_dns" {
  description = "Public DNS hostname of the assignment server"
  value       = aws_instance.assignment.public_dns
}

output "assignment_private_ip" {
  description = "Private IP of the assignment server — checked by the Jenkins assignment pipeline to guarantee it never matches the production private IP"
  value       = aws_instance.assignment.private_ip
}

output "ssh_command" {
  description = "Ready-to-paste SSH command"
  value       = "ssh -i ~/.ssh/${var.key_pair_name}.pem ubuntu@${aws_instance.assignment.public_ip}"
}

output "frontend_url" {
  description = "TechVault storefront URL through the assignment host Nginx reverse proxy"
  value       = var.app_domain != "" ? "http://${var.app_domain}" : "http://${aws_instance.assignment.public_ip}"
}

output "backend_health_url" {
  description = "Backend health check endpoint through the assignment host Nginx reverse proxy"
  value       = var.app_domain != "" ? "http://${var.app_domain}/api/v1/health" : "http://${aws_instance.assignment.public_ip}/api/v1/health"
}

output "jenkins_url" {
  description = "Jenkins endpoint, only meaningful when enable_jenkins_port = true (co-located mode)"
  value       = var.enable_jenkins_port ? "http://${aws_instance.assignment.public_ip}:${var.jenkins_port}" : "Jenkins is not exposed on this instance (enable_jenkins_port = false) — see devops/jenkins/README.md for the recommended separate-host topology"
}
