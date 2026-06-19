output "instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.techvault.id
}

output "public_ip" {
  description = "Public IP address of the TechVault server"
  value       = aws_instance.techvault.public_ip
}

output "public_dns" {
  description = "Public DNS hostname of the server"
  value       = aws_instance.techvault.public_dns
}

output "frontend_url" {
  description = "TechVault storefront URL"
  value       = "http://${aws_instance.techvault.public_ip}:3000"
}

output "api_url" {
  description = "TechVault REST API base URL"
  value       = "http://${aws_instance.techvault.public_ip}:5000/api/v1"
}

output "health_url" {
  description = "Backend health check endpoint"
  value       = "http://${aws_instance.techvault.public_ip}:5000/api/v1/health"
}

output "ssh_command" {
  description = "Ready-to-paste SSH command"
  value       = "ssh -i ~/.ssh/${var.key_pair_name}.pem ubuntu@${aws_instance.techvault.public_ip}"
}
