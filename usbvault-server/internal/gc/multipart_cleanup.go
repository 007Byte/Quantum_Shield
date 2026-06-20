package gc

import (
	"context"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/rs/zerolog/log"
)

// MultipartCleanupJob aborts incomplete S3 multipart uploads older than maxAge.
type MultipartCleanupJob struct {
	s3Client *s3.Client
	bucket   string
	maxAge   time.Duration
}

func NewMultipartCleanupJob(s3Client *s3.Client, bucket string, maxAge time.Duration) *MultipartCleanupJob {
	return &MultipartCleanupJob{
		s3Client: s3Client,
		bucket:   bucket,
		maxAge:   maxAge,
	}
}

func (j *MultipartCleanupJob) Name() string { return "multipart_uploads" }

func (j *MultipartCleanupJob) Run(ctx context.Context) (int, error) {
	aborted := 0
	cutoff := time.Now().Add(-j.maxAge)

	var keyMarker *string
	var uploadIDMarker *string

	for {
		if ctx.Err() != nil {
			return aborted, ctx.Err()
		}

		input := &s3.ListMultipartUploadsInput{
			Bucket:         aws.String(j.bucket),
			KeyMarker:      keyMarker,
			UploadIdMarker: uploadIDMarker,
			MaxUploads:     aws.Int32(100),
		}

		output, err := j.s3Client.ListMultipartUploads(ctx, input)
		if err != nil {
			return aborted, err
		}

		for _, upload := range output.Uploads {
			if upload.Initiated == nil || upload.Initiated.After(cutoff) {
				continue
			}

			_, err := j.s3Client.AbortMultipartUpload(ctx, &s3.AbortMultipartUploadInput{
				Bucket:   aws.String(j.bucket),
				Key:      upload.Key,
				UploadId: upload.UploadId,
			})
			if err != nil {
				log.Warn().Err(err).
					Str("key", aws.ToString(upload.Key)).
					Str("upload_id", aws.ToString(upload.UploadId)).
					Msg("GC: failed to abort multipart upload")
				continue
			}

			aborted++
			log.Debug().
				Str("key", aws.ToString(upload.Key)).
				Time("initiated", *upload.Initiated).
				Msg("GC: aborted stale multipart upload")
		}

		if !aws.ToBool(output.IsTruncated) {
			break
		}
		keyMarker = output.NextKeyMarker
		uploadIDMarker = output.NextUploadIdMarker
	}

	return aborted, nil
}
