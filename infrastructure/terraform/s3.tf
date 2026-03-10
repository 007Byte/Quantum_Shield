# Terraform configuration for USBVault S3 bucket with security and compliance controls

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

locals {
  bucket_name = "usbvault-prod"
  environment = "production"

  tags = {
    Environment = local.environment
    Project     = "USBVault"
    ManagedBy   = "Terraform"
  }
}

# Main S3 bucket for encrypted vault data
resource "aws_s3_bucket" "vault_data" {
  bucket = local.bucket_name

  tags = merge(
    local.tags,
    {
      Name        = "USBVault Production Data"
      Description = "Encrypted vault data storage"
    }
  )
}

# Enable versioning for backup and recovery
resource "aws_s3_bucket_versioning" "vault_data" {
  bucket = aws_s3_bucket.vault_data.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Server-side encryption with AES-256
resource "aws_s3_bucket_server_side_encryption_configuration" "vault_data" {
  bucket = aws_s3_bucket.vault_data.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# Public access block to prevent accidental exposure
resource "aws_s3_bucket_public_access_block" "vault_data" {
  bucket = aws_s3_bucket.vault_data.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# CORS configuration for presigned URL downloads
resource "aws_s3_bucket_cors" "vault_data" {
  bucket = aws_s3_bucket.vault_data.id

  cors_rule {
    allowed_headers = ["Authorization", "Content-Length", "X-Amz-Date", "X-Amz-Content-SHA256"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE", "HEAD"]
    allowed_origins = [
      "https://app.usbvault.com",
      "https://api.usbvault.com"
    ]
    expose_headers = [
      "ETag",
      "X-Amz-Version-Id",
      "X-Amz-Request-Id"
    ]
    max_age_seconds = 3600
  }
}

# Lifecycle rules for cost optimization
resource "aws_s3_bucket_lifecycle_configuration" "vault_data" {
  bucket = aws_s3_bucket.vault_data.id

  rule {
    id     = "transition-to-glacier"
    status = "Enabled"

    filter {
      prefix = "vaults/"
    }

    # Transition old versions to Glacier after 90 days
    noncurrent_version_transitions {
      noncurrent_days = 90
      storage_class   = "GLACIER"
    }

    # Delete old versions after 365 days
    noncurrent_version_expiration {
      noncurrent_days = 365
    }

    # Transition current objects after 2 years (optional)
    transitions {
      days          = 730
      storage_class = "DEEP_ARCHIVE"
    }

    # Delete incomplete multipart uploads after 7 days
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  rule {
    id     = "delete-old-logs"
    status = "Enabled"

    filter {
      prefix = "logs/"
    }

    expiration {
      days = 90
    }
  }
}

# Audit logging to separate bucket
resource "aws_s3_bucket" "audit_logs" {
  bucket = "${local.bucket_name}-audit-logs"

  tags = merge(
    local.tags,
    {
      Name        = "USBVault Audit Logs"
      Description = "S3 access logs for vault bucket"
    }
  )
}

# Public access block for audit logs bucket
resource "aws_s3_bucket_public_access_block" "audit_logs" {
  bucket = aws_s3_bucket.audit_logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Server-side encryption for audit logs
resource "aws_s3_bucket_server_side_encryption_configuration" "audit_logs" {
  bucket = aws_s3_bucket.audit_logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Enable logging to audit bucket
resource "aws_s3_bucket_logging" "vault_data" {
  bucket = aws_s3_bucket.vault_data.id

  target_bucket = aws_s3_bucket.audit_logs.id
  target_prefix = "s3-access-logs/${local.bucket_name}/"
}

# Bucket versioning for audit logs
resource "aws_s3_bucket_versioning" "audit_logs" {
  bucket = aws_s3_bucket.audit_logs.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Lifecycle policy for audit logs retention
resource "aws_s3_bucket_lifecycle_configuration" "audit_logs" {
  bucket = aws_s3_bucket.audit_logs.id

  rule {
    id     = "delete-old-audit-logs"
    status = "Enabled"

    expiration {
      days = 180  # Keep audit logs for 6 months
    }

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}

# Bucket policy with security controls
resource "aws_s3_bucket_policy" "vault_data" {
  bucket = aws_s3_bucket.vault_data.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DenyInsecureConnections"
        Effect = "Deny"
        Principal = "*"
        Action = "s3:*"
        Resource = [
          aws_s3_bucket.vault_data.arn,
          "${aws_s3_bucket.vault_data.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      },
      {
        Sid    = "DenyUnencryptedObjectUploads"
        Effect = "Deny"
        Principal = "*"
        Action = "s3:PutObject"
        Resource = "${aws_s3_bucket.vault_data.arn}/*"
        Condition = {
          StringNotEquals = {
            "s3:x-amz-server-side-encryption" = [
              "AES256",
              "aws:kms"
            ]
          }
        }
      },
      {
        Sid    = "DenyPublicACLs"
        Effect = "Deny"
        Principal = "*"
        Action = [
          "s3:PutObjectAcl",
          "s3:PutBucketAcl"
        ]
        Resource = [
          aws_s3_bucket.vault_data.arn,
          "${aws_s3_bucket.vault_data.arn}/*"
        ]
        Condition = {
          StringLike = {
            "s3:x-amz-acl" = [
              "public-read",
              "public-read-write",
              "authenticated-read"
            ]
          }
        }
      },
      {
        Sid    = "AllowPresignedURLAccess"
        Effect = "Allow"
        Principal = "*"
        Action = [
          "s3:GetObject",
          "s3:PutObject"
        ]
        Resource = "${aws_s3_bucket.vault_data.arn}/vaults/*"
        Condition = {
          Bool = {
            "aws:SecureTransport" = "true"
          }
        }
      }
    ]
  })
}

# IAM role for API server
resource "aws_iam_role" "api_server" {
  name = "usbvault-api-server-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.tags
}

# IAM policy for API server S3 access
resource "aws_iam_role_policy" "api_server_s3" {
  name = "usbvault-api-server-s3-policy"
  role = aws_iam_role.api_server.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowS3ObjectOperations"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:HeadObject"
        ]
        Resource = "${aws_s3_bucket.vault_data.arn}/vaults/*"
        Condition = {
          Bool = {
            "aws:SecureTransport" = "true"
          }
        }
      },
      {
        Sid    = "AllowS3ListBucket"
        Effect = "Allow"
        Action = [
          "s3:ListBucket"
        ]
        Resource = aws_s3_bucket.vault_data.arn
        Condition = {
          StringEquals = {
            "s3:prefix" = [
              "vaults/",
              ""
            ]
          }
        }
      },
      {
        Sid    = "DenyInsecureTransport"
        Effect = "Deny"
        Action = "s3:*"
        Resource = [
          aws_s3_bucket.vault_data.arn,
          "${aws_s3_bucket.vault_data.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      },
      {
        Sid    = "DenyUnencryptedUploads"
        Effect = "Deny"
        Action = "s3:PutObject"
        Resource = "${aws_s3_bucket.vault_data.arn}/*"
        Condition = {
          StringNotEquals = {
            "s3:x-amz-server-side-encryption" = [
              "AES256",
              "aws:kms"
            ]
          }
        }
      }
    ]
  })
}

# Instance profile for EC2 instances
resource "aws_iam_instance_profile" "api_server" {
  name = "usbvault-api-server-profile"
  role = aws_iam_role.api_server.name
}

# CloudWatch monitoring for S3 bucket
resource "aws_cloudwatch_metric_alarm" "s3_4xx_errors" {
  alarm_name          = "usbvault-s3-4xx-errors"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = "1"
  metric_name         = "4xxErrors"
  namespace           = "AWS/S3"
  period              = "300"
  statistic           = "Sum"
  threshold           = "10"
  alarm_description   = "Alert when S3 4xx errors exceed threshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    BucketName = aws_s3_bucket.vault_data.id
  }

  tags = local.tags
}

resource "aws_cloudwatch_metric_alarm" "s3_5xx_errors" {
  alarm_name          = "usbvault-s3-5xx-errors"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = "1"
  metric_name         = "5xxErrors"
  namespace           = "AWS/S3"
  period              = "300"
  statistic           = "Sum"
  threshold           = "1"
  alarm_description   = "Alert when S3 5xx errors occur"
  treat_missing_data  = "notBreaching"

  dimensions = {
    BucketName = aws_s3_bucket.vault_data.id
  }

  tags = local.tags
}

# Outputs for use by other modules
output "vault_bucket_name" {
  description = "Name of the vault data bucket"
  value       = aws_s3_bucket.vault_data.id
}

output "vault_bucket_arn" {
  description = "ARN of the vault data bucket"
  value       = aws_s3_bucket.vault_data.arn
}

output "audit_bucket_name" {
  description = "Name of the audit logs bucket"
  value       = aws_s3_bucket.audit_logs.id
}

output "api_server_role_arn" {
  description = "ARN of the API server IAM role"
  value       = aws_iam_role.api_server.arn
}

output "api_server_instance_profile_arn" {
  description = "ARN of the API server instance profile"
  value       = aws_iam_instance_profile.api_server.arn
}
