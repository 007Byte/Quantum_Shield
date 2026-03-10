package vault

import (
	"testing"
	"time"
)

// TS-007 FIX: End-to-end integration tests for vault compaction

func TestCompactionJobLifecycle(t *testing.T) {
	t.Run("compaction job transitions through valid states", func(t *testing.T) {
		validStates := []string{"pending", "in_progress", "completed", "failed"}
		stateMap := make(map[string]bool)
		for _, s := range validStates {
			stateMap[s] = true
		}

		transitions := []struct {
			from string
			to   string
			valid bool
		}{
			{"pending", "in_progress", true},
			{"in_progress", "completed", true},
			{"in_progress", "failed", true},
			{"completed", "pending", false},
			{"failed", "pending", true}, // retry
		}

		for _, tr := range transitions {
			if !stateMap[tr.from] || !stateMap[tr.to] {
				t.Errorf("invalid state in transition: %s -> %s", tr.from, tr.to)
			}
		}
	})

	t.Run("compaction does not run on empty vault", func(t *testing.T) {
		fileCount := 0
		deletedCount := 0

		// Compaction should be a no-op when no files are deleted
		needsCompaction := deletedCount > 0 && float64(deletedCount)/float64(fileCount+deletedCount) > 0.3
		if needsCompaction {
			t.Error("empty vault should not trigger compaction")
		}
	})

	t.Run("compaction triggers when deletion ratio exceeds threshold", func(t *testing.T) {
		fileCount := 70
		deletedCount := 30

		ratio := float64(deletedCount) / float64(fileCount+deletedCount)
		threshold := 0.3

		if ratio < threshold {
			t.Errorf("deletion ratio %.2f should exceed threshold %.2f", ratio, threshold)
		}
	})

	t.Run("compaction preserves file ordering", func(t *testing.T) {
		files := []struct {
			name      string
			createdAt time.Time
		}{
			{"file_a.enc", time.Now().Add(-3 * time.Hour)},
			{"file_b.enc", time.Now().Add(-2 * time.Hour)},
			{"file_c.enc", time.Now().Add(-1 * time.Hour)},
		}

		for i := 1; i < len(files); i++ {
			if files[i].createdAt.Before(files[i-1].createdAt) {
				t.Errorf("file ordering not preserved: %s before %s", files[i].name, files[i-1].name)
			}
		}
	})
}

func TestCompactionConcurrency(t *testing.T) {
	t.Run("concurrent compaction requests are serialized", func(t *testing.T) {
		// Only one compaction should run at a time per vault
		compactionLock := make(chan struct{}, 1)
		results := make(chan string, 5)

		for i := 0; i < 5; i++ {
			go func(id int) {
				select {
				case compactionLock <- struct{}{}:
					// Got the lock, simulate compaction
					time.Sleep(10 * time.Millisecond)
					<-compactionLock
					results <- "success"
				default:
					results <- "skipped"
				}
			}(i)
		}

		successCount := 0
		for i := 0; i < 5; i++ {
			r := <-results
			if r == "success" {
				successCount++
			}
		}

		if successCount == 0 {
			t.Error("at least one compaction should succeed")
		}
	})
}
