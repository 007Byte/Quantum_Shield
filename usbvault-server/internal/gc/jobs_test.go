package gc

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestAuditRetentionJob(t *testing.T) {
	t.Parallel()

	mock := &mockAuditArchiver{archived: 10, deleted: 5}
	job := NewAuditRetentionJob(mock, 365, 730)

	assert.Equal(t, "audit_retention", job.Name())
	cleaned, err := job.Run(context.Background())
	assert.NoError(t, err)
	assert.Equal(t, 15, cleaned) // archived + deleted
	assert.Equal(t, 365, mock.retentionDays)
	assert.Equal(t, 730, mock.archiveRetentionDays)
}

type mockAuditArchiver struct {
	archived             int
	deleted              int
	retentionDays        int
	archiveRetentionDays int
}

func (m *mockAuditArchiver) ArchiveOldAuditLogs(_ context.Context, retentionDays, archiveRetentionDays int) (int, int, error) {
	m.retentionDays = retentionDays
	m.archiveRetentionDays = archiveRetentionDays
	return m.archived, m.deleted, nil
}

func TestSessionCleanupJob_Name(t *testing.T) {
	t.Parallel()
	job := NewSessionCleanupJob(nil)
	assert.Equal(t, "expired_sessions", job.Name())
}

func TestMultipartCleanupJob_Name(t *testing.T) {
	t.Parallel()
	job := NewMultipartCleanupJob(nil, "test-bucket", 0)
	assert.Equal(t, "multipart_uploads", job.Name())
}

func TestS3OrphanJob_Name(t *testing.T) {
	t.Parallel()
	job := NewS3OrphanJob(nil, nil, "test-bucket", 1000)
	assert.Equal(t, "s3_orphans", job.Name())
}

func TestRedisScanJob_Name(t *testing.T) {
	t.Parallel()
	job := NewRedisScanJob(nil, 1024)
	assert.Equal(t, "redis_scan", job.Name())
}
