package gc

import "context"

// BlobCleaner is the minimal interface for blob cleanup.
type BlobCleaner interface {
	CleanupExpiredBlobs(ctx context.Context, retentionDays int) (int, error)
}

// ShareCleaner is the minimal interface for share cleanup.
type ShareCleaner interface {
	CleanupExpiredShares(ctx context.Context) (int, error)
}

// ExpiredBlobJob wraps BlobLifecycleService.CleanupExpiredBlobs.
type ExpiredBlobJob struct {
	svc           BlobCleaner
	retentionDays int
}

func NewExpiredBlobJob(svc BlobCleaner, retentionDays int) *ExpiredBlobJob {
	return &ExpiredBlobJob{svc: svc, retentionDays: retentionDays}
}

func (j *ExpiredBlobJob) Name() string { return "expired_blobs" }

func (j *ExpiredBlobJob) Run(ctx context.Context) (int, error) {
	return j.svc.CleanupExpiredBlobs(ctx, j.retentionDays)
}

// ExpiredShareJob wraps CleanupService.CleanupExpiredShares.
type ExpiredShareJob struct {
	svc ShareCleaner
}

func NewExpiredShareJob(svc ShareCleaner) *ExpiredShareJob {
	return &ExpiredShareJob{svc: svc}
}

func (j *ExpiredShareJob) Name() string { return "expired_shares" }

func (j *ExpiredShareJob) Run(ctx context.Context) (int, error) {
	return j.svc.CleanupExpiredShares(ctx)
}
