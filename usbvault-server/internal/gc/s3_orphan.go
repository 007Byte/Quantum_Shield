package gc

import (
	"context"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
)

// S3OrphanJob finds and deletes S3 objects that have no corresponding DB record.
type S3OrphanJob struct {
	s3Client   *s3.Client
	pool       *pgxpool.Pool
	bucket     string
	maxDeletes int
}

func NewS3OrphanJob(s3Client *s3.Client, pool *pgxpool.Pool, bucket string, maxDeletes int) *S3OrphanJob {
	return &S3OrphanJob{
		s3Client:   s3Client,
		pool:       pool,
		bucket:     bucket,
		maxDeletes: maxDeletes,
	}
}

func (j *S3OrphanJob) Name() string { return "s3_orphans" }

func (j *S3OrphanJob) Run(ctx context.Context) (int, error) {
	deleted := 0
	var continuationToken *string

	for {
		if ctx.Err() != nil {
			return deleted, ctx.Err()
		}

		if j.maxDeletes > 0 && deleted >= j.maxDeletes {
			log.Info().Int("deleted", deleted).Msg("GC: S3 orphan max deletes reached, stopping")
			break
		}

		input := &s3.ListObjectsV2Input{
			Bucket:            aws.String(j.bucket),
			Prefix:            aws.String("vaults/"),
			MaxKeys:           aws.Int32(100),
			ContinuationToken: continuationToken,
		}

		output, err := j.s3Client.ListObjectsV2(ctx, input)
		if err != nil {
			return deleted, err
		}

		// Extract blob IDs from S3 keys (format: vaults/{vaultID}/{blobID})
		var blobIDs []uuid.UUID
		type s3Entry struct {
			key    string
			blobID uuid.UUID
		}
		var entries []s3Entry

		for _, obj := range output.Contents {
			parts := strings.Split(aws.ToString(obj.Key), "/")
			if len(parts) != 3 {
				continue
			}
			blobID, err := uuid.Parse(parts[2])
			if err != nil {
				continue
			}
			blobIDs = append(blobIDs, blobID)
			entries = append(entries, s3Entry{key: aws.ToString(obj.Key), blobID: blobID})
		}

		if len(blobIDs) > 0 {
			// Batch check which IDs exist in DB
			rows, err := j.pool.Query(ctx,
				`SELECT id FROM blobs WHERE id = ANY($1)`, blobIDs)
			if err != nil {
				return deleted, err
			}

			existsInDB := make(map[uuid.UUID]bool)
			for rows.Next() {
				var id uuid.UUID
				if err := rows.Scan(&id); err != nil {
					rows.Close()
					return deleted, err
				}
				existsInDB[id] = true
			}
			rows.Close()

			// Delete orphans
			for _, entry := range entries {
				if existsInDB[entry.blobID] {
					continue
				}

				if j.maxDeletes > 0 && deleted >= j.maxDeletes {
					break
				}

				_, err := j.s3Client.DeleteObject(ctx, &s3.DeleteObjectInput{
					Bucket: aws.String(j.bucket),
					Key:    aws.String(entry.key),
				})
				if err != nil {
					log.Warn().Err(err).Str("key", entry.key).Msg("GC: failed to delete S3 orphan")
					continue
				}

				deleted++
				log.Debug().Str("key", entry.key).Msg("GC: deleted S3 orphan")

				// Rate limit: brief pause between deletes
				time.Sleep(10 * time.Millisecond)
			}
		}

		if !aws.ToBool(output.IsTruncated) {
			break
		}
		continuationToken = output.NextContinuationToken
	}

	return deleted, nil
}
