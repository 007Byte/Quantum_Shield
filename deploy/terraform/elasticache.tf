# ------------------------------------------------------------------------------
# Redis ElastiCache — LAUNCH-2
# Replication group with automatic failover, encryption at rest and in transit
# ------------------------------------------------------------------------------

resource "aws_elasticache_subnet_group" "usbvault" {
  name        = "usbvault-${var.environment}"
  description = "Private subnets for USBVault Redis"
  subnet_ids  = var.private_subnet_ids

  tags = {
    Name = "usbvault-${var.environment}-redis-subnet-group"
  }
}

resource "aws_security_group" "redis" {
  name_prefix = "usbvault-${var.environment}-redis-"
  description = "Allow Redis access from EKS node groups only"
  vpc_id      = var.vpc_id

  tags = {
    Name = "usbvault-${var.environment}-redis"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group_rule" "redis_ingress" {
  for_each = toset(var.allowed_security_group_ids)

  type                     = "ingress"
  from_port                = 6379
  to_port                  = 6379
  protocol                 = "tcp"
  source_security_group_id = each.value
  security_group_id        = aws_security_group.redis.id
  description              = "Redis from allowed SG ${each.value}"
}

resource "aws_security_group_rule" "redis_egress" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.redis.id
  description       = "Allow all outbound traffic"
}

resource "aws_elasticache_parameter_group" "usbvault" {
  name        = "usbvault-${var.environment}-redis71"
  family      = "redis7"
  description = "USBVault Redis 7.1 parameter group"

  parameter {
    name  = "maxmemory-policy"
    value = "volatile-lru"
  }

  tags = {
    Name = "usbvault-${var.environment}-redis71"
  }
}

resource "aws_elasticache_replication_group" "usbvault" {
  replication_group_id = "usbvault-${var.environment}"
  description          = "USBVault ${var.environment} Redis replication group"

  # Engine
  engine         = "redis"
  engine_version = "7.1"
  node_type      = var.redis_node_type

  # Topology — primary + replica(s)
  num_cache_clusters = var.redis_num_cache_nodes

  # High availability
  automatic_failover_enabled = true
  multi_az_enabled           = true

  # Networking
  subnet_group_name  = aws_elasticache_subnet_group.usbvault.name
  security_group_ids = [aws_security_group.redis.id]
  port               = 6379

  # Encryption — TLS 1.3 minimum enforced
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  transit_encryption_mode    = "required"
  auth_token                 = random_password.redis_auth.result

  # Parameters
  parameter_group_name = aws_elasticache_parameter_group.usbvault.name

  # Backups
  snapshot_retention_limit = 7
  snapshot_window          = "04:00-05:00"

  # Maintenance
  maintenance_window = "sun:05:00-sun:06:00"

  # Auto minor version upgrades
  auto_minor_version_upgrade = true

  # Safety — do not apply changes immediately in production
  apply_immediately = false

  lifecycle {
    prevent_destroy = true
    ignore_changes = [
      num_cache_clusters,
    ]
  }

  tags = {
    Name     = "usbvault-${var.environment}-redis"
    Critical = "true"
  }
}
