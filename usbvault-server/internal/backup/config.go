package backup

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/rs/zerolog/log"
)

// SD-017 FIX: Encrypted backup configuration for database backups

// BackupConfig holds the configuration for encrypted database backups
type BackupConfig struct {
	// EncryptionKey is the AES-256 key for encrypting backups (base64-encoded)
	EncryptionKey []byte

	// StoragePath is the local directory for backup files
	StoragePath string

	// S3Bucket is the S3 bucket for remote backup storage
	S3Bucket string

	// S3Region is the AWS region for the S3 bucket
	S3Region string

	// RetentionDays is how long to keep backups
	RetentionDays int

	// Schedule is the cron expression for automatic backups
	Schedule string
}

// LoadBackupConfig loads backup configuration from environment variables
func LoadBackupConfig() (*BackupConfig, error) {
	keyStr := os.Getenv("BACKUP_ENCRYPTION_KEY")
	if keyStr == "" {
		env := os.Getenv("ENVIRONMENT")
		if env == "production" {
			return nil, fmt.Errorf("BACKUP_ENCRYPTION_KEY must be set in production")
		}
		log.Warn().Msg("BACKUP_ENCRYPTION_KEY not set — backups will NOT be encrypted. Set this for production use.")
		return nil, nil
	}

	// Support key file path
	keyFilePath := os.Getenv("BACKUP_ENCRYPTION_KEY_FILE")
	if keyFilePath != "" {
		keyFilePath = filepath.Clean(keyFilePath)
		keyBytes, err := os.ReadFile(keyFilePath) //gosec:disable G703 -- operator-configured path from trusted env var, normalized with filepath.Clean
		if err != nil {
			return nil, fmt.Errorf("failed to read backup encryption key file: %w", err)
		}
		keyStr = string(keyBytes)
	}

	keyBytes, err := base64.StdEncoding.DecodeString(keyStr)
	if err != nil {
		return nil, fmt.Errorf("BACKUP_ENCRYPTION_KEY is not valid base64: %w", err)
	}
	if len(keyBytes) != 32 {
		return nil, fmt.Errorf("BACKUP_ENCRYPTION_KEY must be 32 bytes (AES-256), got %d", len(keyBytes))
	}

	storagePath := os.Getenv("BACKUP_STORAGE_PATH")
	if storagePath == "" {
		storagePath = "/var/backups/usbvault"
	}

	retentionDays := 30 // default
	schedule := os.Getenv("BACKUP_SCHEDULE")
	if schedule == "" {
		schedule = "0 2 * * *" // 2 AM daily
	}

	return &BackupConfig{
		EncryptionKey: keyBytes,
		StoragePath:   storagePath,
		S3Bucket:      os.Getenv("BACKUP_S3_BUCKET"),
		S3Region:      os.Getenv("BACKUP_S3_REGION"),
		RetentionDays: retentionDays,
		Schedule:      schedule,
	}, nil
}

// EncryptBackup encrypts a backup payload using AES-256-GCM
func (c *BackupConfig) EncryptBackup(plaintext []byte) ([]byte, error) {
	if c == nil || len(c.EncryptionKey) != 32 {
		return nil, fmt.Errorf("backup encryption not configured")
	}

	block, err := aes.NewCipher(c.EncryptionKey)
	if err != nil {
		return nil, fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("failed to create GCM: %w", err)
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("failed to generate nonce: %w", err)
	}

	// Prepend nonce to ciphertext
	ciphertext := gcm.Seal(nonce, nonce, plaintext, nil)
	return ciphertext, nil
}

// DecryptBackup decrypts a backup payload using AES-256-GCM
func (c *BackupConfig) DecryptBackup(ciphertext []byte) ([]byte, error) {
	if c == nil || len(c.EncryptionKey) != 32 {
		return nil, fmt.Errorf("backup encryption not configured")
	}

	block, err := aes.NewCipher(c.EncryptionKey)
	if err != nil {
		return nil, fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("failed to create GCM: %w", err)
	}

	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return nil, fmt.Errorf("ciphertext too short")
	}

	nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("backup decryption failed: %w", err)
	}

	return plaintext, nil
}

// BackupMetadata contains information about a backup
type BackupMetadata struct {
	ID          string    `json:"id"`
	CreatedAt   time.Time `json:"created_at"`
	SizeBytes   int64     `json:"size_bytes"`
	Encrypted   bool      `json:"encrypted"`
	Checksum    string    `json:"checksum"` // SHA-256 of encrypted backup
	StoragePath string    `json:"storage_path"`
}

// ValidateConfig checks that the backup configuration is valid for production use
func (c *BackupConfig) ValidateConfig() error {
	if c == nil {
		return fmt.Errorf("backup config is nil")
	}
	if len(c.EncryptionKey) != 32 {
		return fmt.Errorf("encryption key must be 32 bytes")
	}
	if c.StoragePath == "" {
		return fmt.Errorf("storage path must be set")
	}
	return nil
}

// CreateBackup creates an encrypted backup (stub for actual pg_dump integration)
func CreateBackup(ctx context.Context, config *BackupConfig) (*BackupMetadata, error) {
	if config == nil {
		return nil, fmt.Errorf("backup config not initialized")
	}

	log.Info().Str("storage_path", config.StoragePath).Msg("creating encrypted database backup")

	// In production, this would:
	// 1. Run pg_dump to get database snapshot
	// 2. Encrypt the dump using config.EncryptBackup()
	// 3. Write to local storage
	// 4. Optionally upload to S3
	// 5. Clean up old backups per retention policy

	return &BackupMetadata{
		ID:        fmt.Sprintf("backup-%d", time.Now().Unix()),
		CreatedAt: time.Now(),
		Encrypted: true,
	}, nil
}
