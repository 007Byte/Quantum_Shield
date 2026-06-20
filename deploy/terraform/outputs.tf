# ------------------------------------------------------------------------------
# Outputs — connection details for downstream consumers (K8s secrets, CI/CD)
# ------------------------------------------------------------------------------

output "rds_endpoint" {
  description = "RDS instance endpoint (hostname only)"
  value       = aws_db_instance.usbvault.address
}

output "rds_port" {
  description = "RDS instance port"
  value       = aws_db_instance.usbvault.port
}

output "rds_database_name" {
  description = "Name of the PostgreSQL database"
  value       = aws_db_instance.usbvault.db_name
}

output "redis_endpoint" {
  description = "Redis primary endpoint address"
  value       = aws_elasticache_replication_group.usbvault.primary_endpoint_address
}

output "redis_port" {
  description = "Redis port"
  value       = 6379
}

output "redis_auth_token" {
  description = "Redis AUTH token for transit-encrypted connections"
  value       = random_password.redis_auth.result
  sensitive   = true
}

output "s3_bucket_name" {
  description = "Name of the S3 bucket for encrypted vault blobs"
  value       = aws_s3_bucket.vault_blobs.id
}

output "s3_bucket_arn" {
  description = "ARN of the S3 bucket for IAM policy references"
  value       = aws_s3_bucket.vault_blobs.arn
}

output "database_url" {
  description = "Full PostgreSQL connection string (stored in Secrets Manager)"
  value = format(
    "postgres://%s:%s@%s:%s/%s?sslmode=verify-full",
    var.db_master_username,
    random_password.rds_master.result,
    aws_db_instance.usbvault.address,
    aws_db_instance.usbvault.port,
    aws_db_instance.usbvault.db_name,
  )
  sensitive = true
}

output "redis_url" {
  description = "Full Redis connection string with TLS (stored in Secrets Manager)"
  value = format(
    "rediss://:%s@%s:%s",
    random_password.redis_auth.result,
    aws_elasticache_replication_group.usbvault.primary_endpoint_address,
    "6379",
  )
  sensitive = true
}
