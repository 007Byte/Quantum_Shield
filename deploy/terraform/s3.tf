# ------------------------------------------------------------------------------
# S3 Bucket for encrypted vault blobs — LAUNCH-2
# Versioned, encrypted, lifecycle-managed, public access blocked
# ------------------------------------------------------------------------------

resource "aws_s3_bucket" "vault_blobs" {
  bucket        = var.s3_bucket_name
  force_destroy = false

  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Name     = var.s3_bucket_name
    Critical = "true"
  }
}

resource "aws_s3_bucket_versioning" "vault_blobs" {
  bucket = aws_s3_bucket.vault_blobs.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "vault_blobs" {
  bucket = aws_s3_bucket.vault_blobs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "vault_blobs" {
  bucket = aws_s3_bucket.vault_blobs.id

  rule {
    id     = "archive-old-objects"
    status = "Enabled"

    filter {} # Apply to all objects

    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 365
      storage_class = "GLACIER"
    }
  }

  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"

    filter {} # Apply to all objects

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}

resource "aws_s3_bucket_public_access_block" "vault_blobs" {
  bucket = aws_s3_bucket.vault_blobs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

data "aws_iam_policy_document" "vault_blobs_deny_insecure" {
  statement {
    sid    = "DenyNonSSLAccess"
    effect = "Deny"

    principals {
      type        = "AWS"
      identifiers = ["*"]
    }

    actions = ["s3:*"]

    resources = [
      aws_s3_bucket.vault_blobs.arn,
      "${aws_s3_bucket.vault_blobs.arn}/*",
    ]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "vault_blobs" {
  bucket = aws_s3_bucket.vault_blobs.id
  policy = data.aws_iam_policy_document.vault_blobs_deny_insecure.json

  depends_on = [aws_s3_bucket_public_access_block.vault_blobs]
}
