variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment (production, staging, etc.)"
  type        = string
  default     = "production"

  validation {
    condition     = contains(["production", "staging", "development"], var.environment)
    error_message = "Environment must be one of: production, staging, development."
  }
}

variable "vpc_id" {
  description = "ID of the existing VPC where resources will be deployed"
  type        = string
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs for RDS and ElastiCache placement (should span at least 2 AZs)"
  type        = list(string)

  validation {
    condition     = length(var.private_subnet_ids) >= 2
    error_message = "At least 2 private subnets in different AZs are required for high availability."
  }
}

variable "db_instance_class" {
  description = "RDS instance class for PostgreSQL (e.g., db.r6g.large for production)"
  type        = string
  default     = "db.r6g.large"
}

variable "db_allocated_storage" {
  description = "Initial allocated storage for RDS in GiB"
  type        = number
  default     = 100
}

variable "db_max_allocated_storage" {
  description = "Maximum storage for RDS autoscaling in GiB"
  type        = number
  default     = 500
}

variable "db_master_username" {
  description = "Master username for the RDS PostgreSQL instance"
  type        = string
  default     = "usbvault"
}

variable "redis_node_type" {
  description = "ElastiCache Redis node type (e.g., cache.r6g.large for production)"
  type        = string
  default     = "cache.r6g.large"
}

variable "redis_num_cache_nodes" {
  description = "Number of cache nodes in the Redis replication group (primary + replicas)"
  type        = number
  default     = 2
}

variable "s3_bucket_name" {
  description = "Name of the S3 bucket for encrypted vault blobs"
  type        = string
  default     = "usbvault-encrypted-blobs-prod"
}

variable "allowed_security_group_ids" {
  description = "Security group IDs allowed to access RDS and Redis (e.g., EKS node group SGs)"
  type        = list(string)
}
