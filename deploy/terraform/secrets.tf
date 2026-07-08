# ------------------------------------------------------------------------------
# Secrets — randomly generated passwords stored in AWS Secrets Manager
# ------------------------------------------------------------------------------

resource "random_password" "rds_master" {
  length           = 32
  special          = true
  override_special = "!#$%^&*()-_=+"

  lifecycle {
    ignore_changes = all
  }
}

resource "random_password" "redis_auth" {
  length  = 32
  special = false # ElastiCache auth tokens must be printable ASCII, no spaces/quotes

  lifecycle {
    ignore_changes = all
  }
}

# --- Database URL secret ---

resource "aws_secretsmanager_secret" "database_url" {
  name                    = "usbvault/${var.environment}/database-url"
  description             = "PostgreSQL connection string for USBVault ${var.environment}"
  recovery_window_in_days = 30

  tags = {
    Name     = "usbvault-${var.environment}-database-url"
    Critical = "true"
  }
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id = aws_secretsmanager_secret.database_url.id
  secret_string = format(
    "postgres://%s:%s@%s:%s/%s?sslmode=verify-full",
    var.db_master_username,
    random_password.rds_master.result,
    aws_db_instance.usbvault.address,
    aws_db_instance.usbvault.port,
    aws_db_instance.usbvault.db_name,
  )
}

# --- Redis URL secret ---

resource "aws_secretsmanager_secret" "redis_url" {
  name                    = "usbvault/${var.environment}/redis-url"
  description             = "Redis connection string for USBVault ${var.environment}"
  recovery_window_in_days = 30

  tags = {
    Name     = "usbvault-${var.environment}-redis-url"
    Critical = "true"
  }
}

resource "aws_secretsmanager_secret_version" "redis_url" {
  secret_id = aws_secretsmanager_secret.redis_url.id
  secret_string = format(
    "rediss://:%s@%s:%s",
    random_password.redis_auth.result,
    aws_elasticache_replication_group.usbvault.primary_endpoint_address,
    "6379",
  )
}

# --- SRP anti-enumeration secret ---
# The API refuses to start in production if this is unset or shorter than 32
# bytes (cmd/api/app.go); it keys the HMAC that derives the decoy SRP salt for
# non-existent accounts. byte_length = 32 yields a 64-character hex string.

resource "random_id" "srp_enum_secret" {
  byte_length = 32

  lifecycle {
    ignore_changes = all
  }
}

resource "aws_secretsmanager_secret" "srp_enum_secret" {
  name                    = "usbvault/${var.environment}/srp-enum-secret"
  description             = "SRP anti-enumeration decoy-salt HMAC key for USBVault ${var.environment}"
  recovery_window_in_days = 30

  tags = {
    Name     = "usbvault-${var.environment}-srp-enum-secret"
    Critical = "true"
  }
}

resource "aws_secretsmanager_secret_version" "srp_enum_secret" {
  secret_id     = aws_secretsmanager_secret.srp_enum_secret.id
  secret_string = random_id.srp_enum_secret.hex
}
