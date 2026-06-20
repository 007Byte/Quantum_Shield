# ------------------------------------------------------------------------------
# PostgreSQL RDS — LAUNCH-1
# Multi-AZ, encrypted, enhanced monitoring, 30-day backup retention
# ------------------------------------------------------------------------------

resource "aws_db_subnet_group" "usbvault" {
  name        = "usbvault-${var.environment}"
  description = "Private subnets for USBVault RDS"
  subnet_ids  = var.private_subnet_ids

  tags = {
    Name = "usbvault-${var.environment}-db-subnet-group"
  }
}

resource "aws_security_group" "rds" {
  name_prefix = "usbvault-${var.environment}-rds-"
  description = "Allow PostgreSQL access from EKS node groups only"
  vpc_id      = var.vpc_id

  tags = {
    Name = "usbvault-${var.environment}-rds"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group_rule" "rds_ingress" {
  for_each = toset(var.allowed_security_group_ids)

  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = each.value
  security_group_id        = aws_security_group.rds.id
  description              = "PostgreSQL from allowed SG ${each.value}"
}

resource "aws_security_group_rule" "rds_egress" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.rds.id
  description       = "Allow all outbound traffic"
}

# IAM role for RDS Enhanced Monitoring
data "aws_iam_policy_document" "rds_monitoring_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["monitoring.rds.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "rds_monitoring" {
  name_prefix        = "usbvault-rds-monitoring-"
  assume_role_policy = data.aws_iam_policy_document.rds_monitoring_assume.json

  tags = {
    Name = "usbvault-${var.environment}-rds-monitoring"
  }
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

resource "aws_db_parameter_group" "usbvault" {
  name_prefix = "usbvault-${var.environment}-pg16-"
  family      = "postgres16"
  description = "USBVault PostgreSQL 16 parameter group with audit logging"

  parameter {
    name  = "log_statement"
    value = "ddl"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  # TLS 1.3 minimum — reject connections using older TLS versions
  parameter {
    name  = "ssl_min_protocol_version"
    value = "TLSv1.3"
  }

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "usbvault-${var.environment}-pg16"
  }
}

resource "aws_db_instance" "usbvault" {
  identifier = "usbvault-${var.environment}"

  # Engine
  engine         = "postgres"
  engine_version = "16.4"

  # Sizing
  instance_class        = var.db_instance_class
  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_max_allocated_storage
  storage_type          = "gp3"

  # Database
  db_name  = "usbvault"
  username = var.db_master_username
  password = random_password.rds_master.result
  port     = 5432

  # High availability
  multi_az = true

  # Networking
  db_subnet_group_name   = aws_db_subnet_group.usbvault.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false

  # Encryption
  storage_encrypted = true

  # Backups
  backup_retention_period   = 30
  backup_window             = "03:00-04:00"
  maintenance_window        = "sun:05:00-sun:06:00"
  copy_tags_to_snapshot     = true
  final_snapshot_identifier = "usbvault-${var.environment}-final-${formatdate("YYYY-MM-DD", timestamp())}"
  skip_final_snapshot       = false
  delete_automated_backups  = false

  # Monitoring
  performance_insights_enabled          = true
  performance_insights_retention_period = 7
  monitoring_interval                   = 60
  monitoring_role_arn                   = aws_iam_role.rds_monitoring.arn

  # Parameters
  parameter_group_name = aws_db_parameter_group.usbvault.name

  # Safety
  deletion_protection = true
  apply_immediately   = false

  # Auto minor version upgrades during maintenance window
  auto_minor_version_upgrade = true

  lifecycle {
    prevent_destroy = true
    ignore_changes = [
      final_snapshot_identifier,
    ]
  }

  tags = {
    Name     = "usbvault-${var.environment}"
    Backup   = "true"
    Critical = "true"
  }
}
