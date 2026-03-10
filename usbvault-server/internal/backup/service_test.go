package backup

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// mockExecutor records calls and returns configured output.
type mockExecutor struct {
	output []byte
	err    error
	calls  []string
}

func (m *mockExecutor) ExecuteCommand(_ context.Context, name string, args ...string) ([]byte, error) {
	m.calls = append(m.calls, fmt.Sprintf("%s %v", name, args))
	return m.output, m.err
}

// mockS3 is an in-memory S3 mock.
type mockS3 struct {
	objects    map[string][]byte
	uploadErr  error
	deleteErr  error
	listErr    error
	downloadErr error
}

func newMockS3() *mockS3 {
	return &mockS3{objects: make(map[string][]byte)}
}

func (m *mockS3) Upload(_ context.Context, bucket, key string, data []byte) error {
	if m.uploadErr != nil {
		return m.uploadErr
	}
	k := bucket + "/" + key
	m.objects[k] = make([]byte, len(data))
	copy(m.objects[k], data)
	return nil
}

func (m *mockS3) Download(_ context.Context, bucket, key string) ([]byte, error) {
	if m.downloadErr != nil {
		return nil, m.downloadErr
	}
	k := bucket + "/" + key
	data, ok := m.objects[k]
	if !ok {
		return nil, fmt.Errorf("not found: %s", k)
	}
	return data, nil
}

func (m *mockS3) Delete(_ context.Context, bucket, key string) error {
	if m.deleteErr != nil {
		return m.deleteErr
	}
	k := bucket + "/" + key
	delete(m.objects, k)
	return nil
}

func (m *mockS3) ListKeys(_ context.Context, bucket, prefix string) ([]string, error) {
	if m.listErr != nil {
		return nil, m.listErr
	}
	var keys []string
	for k := range m.objects {
		full := bucket + "/" + prefix
		if len(k) >= len(full) && k[:len(full)] == full {
			// Return just the key part (without bucket prefix)
			keys = append(keys, k[len(bucket)+1:])
		}
	}
	return keys, nil
}

func testConfig(t *testing.T) (*BackupConfig, string) {
	t.Helper()
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i)
	}
	tmpDir := t.TempDir()
	return &BackupConfig{
		EncryptionKey: key,
		StoragePath:   tmpDir,
		S3Bucket:      "test-bucket",
		S3Region:      "us-east-1",
		RetentionDays: 7,
		Schedule:      "0 2 * * *",
	}, tmpDir
}

func TestBackup_Success(t *testing.T) {
	config, tmpDir := testConfig(t)
	dumpData := []byte("pg_dump output data")
	executor := &mockExecutor{output: dumpData}
	s3mock := newMockS3()

	svc := NewBackupService(config, "postgres://localhost/test", executor, s3mock)
	meta, err := svc.Backup(context.Background())
	if err != nil {
		t.Fatalf("Backup failed: %v", err)
	}

	// Verify metadata
	if meta.ID == "" {
		t.Error("expected non-empty backup ID")
	}
	if !meta.Encrypted {
		t.Error("expected encrypted=true")
	}
	if meta.Checksum == "" {
		t.Error("expected non-empty checksum")
	}
	if meta.SizeBytes <= 0 {
		t.Error("expected positive size")
	}

	// Verify local file written
	localPath := filepath.Join(tmpDir, meta.ID+".enc")
	if _, err := os.Stat(localPath); os.IsNotExist(err) {
		t.Error("expected local backup file to exist")
	}

	// Verify checksum matches local file
	localData, _ := os.ReadFile(localPath)
	hash := sha256.Sum256(localData)
	if hex.EncodeToString(hash[:]) != meta.Checksum {
		t.Error("checksum mismatch")
	}

	// Verify S3 upload happened
	s3Key := fmt.Sprintf("backups/%s.enc", meta.ID)
	if _, ok := s3mock.objects["test-bucket/"+s3Key]; !ok {
		t.Error("expected S3 upload")
	}

	// Verify pg_dump was called with correct args
	if len(executor.calls) != 1 {
		t.Fatalf("expected 1 executor call, got %d", len(executor.calls))
	}
	if executor.calls[0] != "pg_dump [--format=custom postgres://localhost/test]" {
		t.Errorf("unexpected pg_dump call: %s", executor.calls[0])
	}
}

func TestBackup_NoS3(t *testing.T) {
	config, _ := testConfig(t)
	config.S3Bucket = "" // No S3
	executor := &mockExecutor{output: []byte("dump data")}

	svc := NewBackupService(config, "postgres://localhost/test", executor, nil)
	meta, err := svc.Backup(context.Background())
	if err != nil {
		t.Fatalf("Backup without S3 failed: %v", err)
	}
	if meta.ID == "" {
		t.Error("expected non-empty backup ID")
	}
}

func TestBackup_PgDumpFails(t *testing.T) {
	config, _ := testConfig(t)
	executor := &mockExecutor{err: fmt.Errorf("pg_dump: command not found")}

	svc := NewBackupService(config, "postgres://localhost/test", executor, nil)
	_, err := svc.Backup(context.Background())
	if err == nil {
		t.Fatal("expected error when pg_dump fails")
	}
}

func TestBackup_NilConfig(t *testing.T) {
	svc := NewBackupService(nil, "postgres://localhost/test", &mockExecutor{}, nil)
	_, err := svc.Backup(context.Background())
	if err == nil {
		t.Fatal("expected error with nil config")
	}
}

func TestRestore_FromLocal(t *testing.T) {
	config, tmpDir := testConfig(t)
	// Create an encrypted backup file
	plaintext := []byte("restored dump data")
	encrypted, err := config.EncryptBackup(plaintext)
	if err != nil {
		t.Fatal(err)
	}
	backupID := "backup-1234567890"
	if err := os.WriteFile(filepath.Join(tmpDir, backupID+".enc"), encrypted, 0600); err != nil {
		t.Fatal(err)
	}

	executor := &mockExecutor{output: []byte("restore ok")}
	svc := NewBackupService(config, "postgres://localhost/test", executor, nil)

	err = svc.Restore(context.Background(), backupID)
	if err != nil {
		t.Fatalf("Restore failed: %v", err)
	}

	// Verify pg_restore was called
	if len(executor.calls) != 1 {
		t.Fatalf("expected 1 executor call, got %d", len(executor.calls))
	}
	call := executor.calls[0]
	if call[:10] != "pg_restore" {
		t.Errorf("expected pg_restore call, got: %s", call)
	}
}

func TestRestore_FromS3(t *testing.T) {
	config, _ := testConfig(t)
	// Don't create local file — should fall back to S3
	plaintext := []byte("s3 dump data")
	encrypted, err := config.EncryptBackup(plaintext)
	if err != nil {
		t.Fatal(err)
	}

	s3mock := newMockS3()
	s3mock.objects["test-bucket/backups/backup-999.enc"] = encrypted

	executor := &mockExecutor{output: []byte("restore ok")}
	svc := NewBackupService(config, "postgres://localhost/test", executor, s3mock)

	err = svc.Restore(context.Background(), "backup-999")
	if err != nil {
		t.Fatalf("Restore from S3 failed: %v", err)
	}
}

func TestRestore_PathTraversal(t *testing.T) {
	config, _ := testConfig(t)
	svc := NewBackupService(config, "postgres://localhost/test", &mockExecutor{}, nil)

	err := svc.Restore(context.Background(), "../../../etc/passwd")
	if err == nil {
		t.Fatal("expected error for path traversal")
	}
}

func TestListBackups(t *testing.T) {
	config, tmpDir := testConfig(t)
	// Create some fake backup files
	for i := 0; i < 3; i++ {
		name := fmt.Sprintf("backup-%d.enc", 1000+i)
		if err := os.WriteFile(filepath.Join(tmpDir, name), []byte("data"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	// Create a non-backup file (should be ignored)
	os.WriteFile(filepath.Join(tmpDir, "notes.txt"), []byte("hello"), 0600)

	svc := NewBackupService(config, "", &mockExecutor{}, nil)
	backups, err := svc.ListBackups()
	if err != nil {
		t.Fatalf("ListBackups failed: %v", err)
	}
	if len(backups) != 3 {
		t.Fatalf("expected 3 backups, got %d", len(backups))
	}
	for _, b := range backups {
		if !b.Encrypted {
			t.Error("expected encrypted=true")
		}
	}
}

func TestListBackups_EmptyDir(t *testing.T) {
	config, _ := testConfig(t)
	svc := NewBackupService(config, "", &mockExecutor{}, nil)
	backups, err := svc.ListBackups()
	if err != nil {
		t.Fatalf("ListBackups on empty dir failed: %v", err)
	}
	if len(backups) != 0 {
		t.Errorf("expected 0 backups, got %d", len(backups))
	}
}

func TestCleanupOldBackups(t *testing.T) {
	config, tmpDir := testConfig(t)
	config.RetentionDays = 1

	// Create an "old" backup file by setting mod time in the past
	oldFile := filepath.Join(tmpDir, "backup-1000.enc")
	if err := os.WriteFile(oldFile, []byte("old"), 0600); err != nil {
		t.Fatal(err)
	}
	oldTime := time.Now().AddDate(0, 0, -3)
	os.Chtimes(oldFile, oldTime, oldTime)

	// Create a "new" backup file
	newFile := filepath.Join(tmpDir, "backup-9999.enc")
	if err := os.WriteFile(newFile, []byte("new"), 0600); err != nil {
		t.Fatal(err)
	}

	// Also add old S3 key
	s3mock := newMockS3()
	oldTs := time.Now().AddDate(0, 0, -3).Unix()
	s3Key := fmt.Sprintf("backups/backup-%d.enc", oldTs)
	s3mock.objects["test-bucket/"+s3Key] = []byte("s3 old")

	svc := NewBackupService(config, "", &mockExecutor{}, s3mock)
	err := svc.cleanupOldBackups(context.Background())
	if err != nil {
		t.Fatalf("cleanup failed: %v", err)
	}

	// Old local file should be gone
	if _, err := os.Stat(oldFile); !os.IsNotExist(err) {
		t.Error("expected old backup to be deleted")
	}
	// New file should remain
	if _, err := os.Stat(newFile); os.IsNotExist(err) {
		t.Error("expected new backup to remain")
	}
	// Old S3 key should be gone
	if _, ok := s3mock.objects["test-bucket/"+s3Key]; ok {
		t.Error("expected old S3 backup to be deleted")
	}
}

func TestEncryptDecryptRoundTrip(t *testing.T) {
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i)
	}
	config := &BackupConfig{EncryptionKey: key}

	original := []byte("sensitive database dump content")
	encrypted, err := config.EncryptBackup(original)
	if err != nil {
		t.Fatalf("encrypt failed: %v", err)
	}

	decrypted, err := config.DecryptBackup(encrypted)
	if err != nil {
		t.Fatalf("decrypt failed: %v", err)
	}

	if string(decrypted) != string(original) {
		t.Error("roundtrip mismatch")
	}
}

func TestLoadBackupConfig_Valid(t *testing.T) {
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i)
	}
	t.Setenv("BACKUP_ENCRYPTION_KEY", base64.StdEncoding.EncodeToString(key))
	t.Setenv("BACKUP_STORAGE_PATH", "/tmp/test-backups")
	t.Setenv("BACKUP_S3_BUCKET", "my-bucket")
	t.Setenv("BACKUP_S3_REGION", "us-west-2")

	config, err := LoadBackupConfig()
	if err != nil {
		t.Fatalf("LoadBackupConfig failed: %v", err)
	}
	if config.S3Bucket != "my-bucket" {
		t.Errorf("expected bucket my-bucket, got %s", config.S3Bucket)
	}
	if config.RetentionDays != 30 {
		t.Errorf("expected 30 retention days, got %d", config.RetentionDays)
	}
}

func TestLoadBackupConfig_MissingKeyNonProd(t *testing.T) {
	t.Setenv("BACKUP_ENCRYPTION_KEY", "")
	t.Setenv("ENVIRONMENT", "development")

	config, err := LoadBackupConfig()
	if err != nil {
		t.Fatalf("expected nil error for non-prod, got: %v", err)
	}
	if config != nil {
		t.Error("expected nil config when key not set in non-prod")
	}
}

func TestLoadBackupConfig_MissingKeyProduction(t *testing.T) {
	t.Setenv("BACKUP_ENCRYPTION_KEY", "")
	t.Setenv("ENVIRONMENT", "production")

	_, err := LoadBackupConfig()
	if err == nil {
		t.Fatal("expected error for production without key")
	}
}
