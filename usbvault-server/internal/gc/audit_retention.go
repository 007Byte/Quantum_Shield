package gc

import "context"

// AuditArchiver is the minimal interface for audit log archival.
type AuditArchiver interface {
	ArchiveOldAuditLogs(ctx context.Context, retentionDays, archiveRetentionDays int) (archived int, deleted int, err error)
}

// AuditRetentionJob wraps AuditService.ArchiveOldAuditLogs.
type AuditRetentionJob struct {
	svc                  AuditArchiver
	retentionDays        int
	archiveRetentionDays int
}

func NewAuditRetentionJob(svc AuditArchiver, retentionDays, archiveRetentionDays int) *AuditRetentionJob {
	return &AuditRetentionJob{
		svc:                  svc,
		retentionDays:        retentionDays,
		archiveRetentionDays: archiveRetentionDays,
	}
}

func (j *AuditRetentionJob) Name() string { return "audit_retention" }

func (j *AuditRetentionJob) Run(ctx context.Context) (int, error) {
	archived, deleted, err := j.svc.ArchiveOldAuditLogs(ctx, j.retentionDays, j.archiveRetentionDays)
	return archived + deleted, err
}
