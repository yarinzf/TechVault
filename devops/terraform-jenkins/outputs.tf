locals {
  # Prefer the Elastic IP when enabled — it's the stable address; the
  # instance's own public_ip still changes on stop/start either way.
  jenkins_effective_ip = var.enable_elastic_ip ? aws_eip.jenkins[0].public_ip : aws_instance.jenkins.public_ip
}

output "jenkins_instance_id" {
  description = "EC2 instance ID of the Jenkins host"
  value       = aws_instance.jenkins.id
}

output "jenkins_public_ip" {
  description = "Effective public IP of the Jenkins host — the Elastic IP if enable_elastic_ip is true, otherwise the instance's own (stop/start-volatile) public IP"
  value       = local.jenkins_effective_ip
}

output "jenkins_instance_public_ip" {
  description = "The EC2 instance's own public IP, regardless of whether an Elastic IP is also associated — informational, changes on stop/start"
  value       = aws_instance.jenkins.public_ip
}

output "jenkins_private_ip" {
  description = "Private IP of the Jenkins host"
  value       = aws_instance.jenkins.private_ip
}

output "jenkins_public_dns" {
  description = "Public DNS hostname of the Jenkins host (the instance's own DNS name — not affected by enable_elastic_ip)"
  value       = aws_instance.jenkins.public_dns
}

output "ssh_command" {
  description = "Ready-to-paste SSH command"
  value       = "ssh -i ~/.ssh/${var.key_pair_name}.pem ubuntu@${local.jenkins_effective_ip}"
}

output "jenkins_http_url" {
  description = "Jenkins URL over the effective public IP (HTTP, via the host Nginx reverse proxy) — always valid, first-setup mode"
  value       = "http://${local.jenkins_effective_ip}"
}

output "jenkins_domain_url" {
  description = "Jenkins URL over the configured domain, once DNS points here and HTTPS has been set up manually (see devops/ansible-jenkins/README.md). Informational only while jenkins_domain is empty."
  value       = var.jenkins_domain != "" ? "https://${var.jenkins_domain}" : "jenkins_domain is not set — use jenkins_http_url instead"
}
