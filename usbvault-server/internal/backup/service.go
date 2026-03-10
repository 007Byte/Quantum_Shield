package backup

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/rs/zerolog/log"
)

// CommandExecutor abstracts command execution for testability.
type CommandExecutor interface {
	ExecuteCommand(ctx context.Context, name string, args ...string) ([]byte, error)
}

// S3Uploader abstracts S3 operations for testability.
type S3Uploader interface {
	Upload(ctx context.Context, bucket, key string, data []byte) error
	Download(ctx context.Context, bucket, key string) ([]byte, error)
	Delete(ctx context.Context, bucket, key string) error
	ListKeys(ctx context.Context, bucket, prefix string) ([]string, error)
}

// BackupService manages database backups with encryption and S3 storage.
type BackupService struct {
	config   *BackupConfig
	dbURL    string
	executor CommandExecutor
	s3       S3Uploader
}

// NewBackupService creates a new backup service.
func NewBackupService(config *BackupConfig, dbURL string, executor CommandExecutor, uploader S3Uploader) *BackupService {
	return &BackupService{
		config:   config,
		dbURL:    dbURL,
		executor: executor,
		s3:       uploader,
	}
}

// defaultExecutor is the real command executor that calls os/exec.
type defaultExecutor struct{}

func (e *defaultExecutor) ExecuteCommand(ctx context.Context, name string, args ...string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("%s failed: %w, stderr: %s", name, err, stderr.String())
	}
	return stdout.Bytes(), nil
}

// NewDefaultExecutor returns the real command executor.
func NewDefaultExecutor() CommandExecutor {
	return &defaultExecutor{}
}

// realS3Uploader wraps the AWS S3 client.
type realS3Uploader struct {
	client *s3.Client
}

// NewS3Uploader creates an S3Uploader backed by a real AWS S3 client.
func NewS3Uploader(client *s3.Client) S3Uploader {
	return &realS3Uploader{client: client}
}

func (u *realS3Uploader) Upload(ctx context.Context, bucket, key string, data []byte) error {
	_, err := u.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
		Body:   bytes.NewReader(data),
	})
	return err
}

func (u *realS3Uploader) Download(ctx context.Context, bucket, key string) ([]byte, error) {
	out, err := u.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, err
	}
	defer out.Body.Close()
	return io.ReadAll(out.Body)
}

func (u *realS3Uploader) Delete(ctx context.Context, bucket, key string) error {
	_, err := u.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	return err
}

func (u *realS3Uploader) ListKeys(ctx context.Context, bucket, prefix string) ([]string, error) {
	out, err := u.client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
		Bucket: aws.String(bucket),
		Prefix: aws.String(prefix),
	})
	if err != nil {
		return nil, err
	}
	keys := make([]string, 0, len(out.Contents))
	for _, obj := range out.Contents {
		keys = append(keys, *obj.Key)
	}
	return keys, nil
}

// Backup creates an encrypted database backup, stores it locally, and uploads to S3.
func (bs *BackupService) Backup(ctx context.Context) (*BackupMetadata, error) {
	if bs.config == nil {
		return nil, fmt.Errorf("backup config not initialized")
	}
	if err := bs.config.ValidateConfig(); err != nil {
		return nil, fmt.Errorf("invalid backup config: %w", err)
	}

	backupID := fmt.Sprintf("backup-%d", time.Now().Unix())
	log.Info().Str("backup_id", backupID).Msg("starting database backup")

	// 1. Run pg_dump
	dumpData, err := bs.executor.ExecuteCommand(ctx, "pg_dump", "--format=custom", bs.dbURL)
	if err != nil {
		return nil, fmt.Errorf("pg_dump failed: %w", err)
	}
	log.Info().Int("dump_size", len(dumpData)).Msg("pg_dump completed")

	// 2. Encrypt the dump
	encrypted, err := bs.config.EncryptBackup(dumpData)
	if err != nil {
		return nil, fmt.Errorf("encryption failed: %w", err)
	}

	// 3. Compute checksum of encrypted data
	hash := sha256.Sum256(encrypted)
	checksum := hex.EncodeToString(hash[:])

	// 4. Write to local storage
	if err := os.MkdirAll(bs.config.StoragePath, 0700); err != nil {
		return nil, fmt.Errorf("failed to create backup directory: %w", err)
	}
	localPath := filepath.Join(bs.config.StoragePath, backupID+".enc")
	if err := os.WriteFile(localPath, encrypted, 0600); err != nil {
		return nil, fmt.Errorf("failed to write local backup: %w", err)
	}
	log.Info().Str("path", localPath).Msg("local backup written")

	// 5. Upload to S3 if configured
	if bs.s3 != nil && bs.config.S3Bucket != "" {
		s3Key := fmt.Sprintf("backups/%s.enc", backupID)
		if err := bs.s3.Upload(ctx, bs.config.S3Bucket, s3Key, encrypted); err != nil {
			log.Error().Err(err).Msg("S3 upload failed, local backup retained")
		} else {
			log.Info().Str("bucket", bs.config.S3Bucket).Str("key", s3Key).Msg("S3 upload completed")
		}
	}

	// 6. Clean up old backups per retention policy
	if err := bs.cleanupOldBackups(ctx); err != nil {
		log.Warn().Err(err).Msg("backup cleanup encountered errors")
	}

	meta := &BackupMetadata{
		ID:          backupID,
		CreatedAt:   time.Now(),
		SizeBytes:   int64(len(encrypted)),
		Encrypted:   true,
		Checksum:    checksum,
		StoragePath: localPath,
	}

	log.Info().Str("backup_id", backupID).Str("checksum", checksum).Msg("backup completed successfully")
	return meta, nil
}

// Restore decrypts and restores a backup from local storage or S3.
func (bs *BackupService) Restore(ctx context.Context, backupID string) error {
	if bs.config == nil {
		return fmt.Errorf("backup config not initialized")
	}

	// Sanitize backup ID to prevent path traversal
	if strings.Contains(backupID, "/") || strings.Contains(backupID, "..") {
		return fmt.Errorf("invalid backup ID")
	}

	log.Info().Str("backup_id", backupID).Msg("starting backup restore")

	// Try local first, then S3
	var encrypted []byte
	localPath := filepath.Join(bs.config.StoragePath, backupID+".enc")
	data, err := os.ReadFile(localPath)
	if err == nil {
		encrypted = data
	} else if bs.s3 != nil && bs.config.S3Bucket != "" {
		s3Key := fmt.Sprintf("backups/%s.enc", backupID)
		data, err := bs.s3.Download(ctx, bs.config.S3Bucket, s3Key)
		if err != nil {
			return fmt.Errorf("backup not found locally or in S3: %w", err)
		}
		encrypted = data
	} else {
		return fmt.Errorf("backup not found: %s", backupID)
	}

	// Decrypt
	plaintext, err := bs.config.DecryptBackup(encrypted)
	if err != nil {
		return fmt.Errorf("decryption failed: %w", err)
	}

	// Write decrypted dump to temp file for pg_restore
	tmpFile, err := os.CreateTemp("", "usbvault-restore-*.dump")
	if err != nil {
		return fmt.Errorf("failed to create temp file: %w", err)
	}
	defer os.Remove(tmpFile.Name())

	if _, err := tmpFile.Write(plaintext); err != nil {
		tmpFile.Close()
		return fmt.Errorf("failed to write temp file: %w", err)
	}
	tmpFile.Close()

	// Run pg_restore
	_, err = bs.executor.ExecuteCommand(ctx, "pg_restore",
		"--dbname="+bs.dbURL,
		"--clean",
		"--if-exists",
		tmpFile.Name(),
	)
	if err != nil {
		return fmt.Errorf("pg_restore failed: %w", err)
	}

	log.Info().Str("backup_id", backupID).Msg("restore completed successfully")
	return nil
}

// ListBackups returns metadata for all local backups, sorted by creation time (newest first).
func (bs *BackupService) ListBackups() ([]BackupMetadata, error) {
	if bs.config == nil || bs.config.StoragePath == "" {
		return nil, fmt.Errorf("backup config not initialized")
	}

	entries, err := os.ReadDir(bs.config.StoragePath)
	if err != nil {
		if os.IsNotExist(err) {
			return []BackupMetadata{}, nil
		}
		return nil, fmt.Errorf("failed to read backup directory: %w", err)
	}

	var backups []BackupMetadata
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".enc") {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		id := strings.TrimSuffix(entry.Name(), ".enc")
		backups = append(backups, BackupMetadata{
			ID:          id,
			CreatedAt:   info.ModTime(),
			SizeBytes:   info.Size(),
			Encrypted:   true,
			StoragePath: filepath.Join(bs.config.StoragePath, entry.Name()),
		})
	}

	sort.Slice(backups, func(i, j int) bool {
		return backups[i].CreatedAt.After(backups[j].CreatedAt)
	})

	return backups, nil
}

// cleanupOldBackups removes backups older than the retention period.
func (bs *BackupService) cleanupOldBackups(ctx context.Context) error {
	cutoff := time.Now().AddDate(0, 0, -bs.config.RetentionDays)
	var errs []string

	// Clean local backups
	entries, err := os.ReadDir(bs.config.StoragePath)
	if err != nil {
		return fmt.Errorf("failed to read backup directory: %w", err)
	}

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".enc") {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		if info.ModTime().Before(cutoff) {
			path := filepath.Join(bs.config.StoragePath, entry.Name())
			if err := os.Remove(path); err != nil {
				errs = append(errs, fmt.Sprintf("local %s: %v", entry.Name(), err))
			} else {
				log.Info().Str("file", entry.Name()).Msg("removed expired local backup")
			}
		}
	}

	// Clean S3 backups
	if bs.s3 != nil && bs.config.S3Bucket != "" {
		keys, err := bs.s3.ListKeys(ctx, bs.config.S3Bucket, "backups/")
		if err != nil {
			errs = append(errs, fmt.Sprintf("s3 list: %v", err))
		} else {
			for _, key := range keys {
				// Extract timestamp from key like "backups/backup-1234567890.enc"
				base := filepath.Base(key)
				id := strings.TrimSuffix(base, ".enc")
				parts := strings.SplitN(id, "-", 2)
				if len(parts) != 2 {
					continue
				}
				var ts int64
				if _, err := fmt.Sscanf(parts[1], "%d", &ts); err != nil {
					continue
				}
				if time.Unix(ts, 0).Before(cutoff) {
					if err := bs.s3.Delete(ctx, bs.config.S3Bucket, key); err != nil {
						errs = append(errs, fmt.Sprintf("s3 delete %s: %v", key, err))
					} else {
						log.Info().Str("key", key).Msg("removed expired S3 backup")
					}
				}
			}
		}
	}

	if len(errs) > 0 {
		return fmt.Errorf("cleanup errors: %s", strings.Join(errs, "; "))
	}
	return nil
}
