# Multipart Upload Implementation Details

## Overview

This document describes the implementation of PH2-FIX: Multipart Upload Support for the QAV project, enabling efficient uploading of large files (>5GB) with resumable state.

**Implementation Files**:
- `internal/storage/multipart.go` - Core multipart service
- `internal/storage/multipart_handlers.go` - HTTP handlers
- `internal/storage/multipart_test.go` - Unit tests
- `cmd/api/main.go` - Service initialization and route registration

## Architecture

### Service Design

```
┌─────────────────┐
│   HTTP Client   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│   MultipartService Handlers     │
├─────────────────────────────────┤
│ - HandleInitiateMultipart()     │
│ - HandleGetPartURL()            │
│ - HandleCompletePart()          │
│ - HandleFinalizeUpload()        │
│ - HandleAbortUpload()           │
│ - HandleGetProgress()           │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│   MultipartService              │
├─────────────────────────────────┤
│ - InitiateUpload()              │
│ - GeneratePresignedPartURL()    │
│ - CompletePart()                │
│ - FinalizeUpload()              │
│ - AbortUpload()                 │
│ - GetUploadProgress()           │
│ - cleanupExpiredUploads()       │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│   AWS S3 Client (SDK v2)        │
├─────────────────────────────────┤
│ - CreateMultipartUpload()       │
│ - UploadPart()                  │
│ - CompleteMultipartUpload()     │
│ - AbortMultipartUpload()        │
│ - PresignUploadPart()           │
└─────────────────────────────────┘
```

### State Management

The `MultipartService` maintains in-memory state of all active uploads using a thread-safe map:

```go
type MultipartService struct {
    s3Client *s3.Client
    bucket   string
    mu       sync.RWMutex
    uploads  map[string]*MultipartUpload  // uploadID -> upload state
}
```

**Thread Safety**:
- Read locks (`RLock()`) for queries
- Write locks (`Lock()`) for state modifications
- Safe for concurrent uploads from multiple users

### Data Structures

#### MultipartUpload

Tracks metadata for an in-progress upload:

```go
type MultipartUpload struct {
    UploadID      string           // S3 upload ID
    Bucket        string           // S3 bucket name
    Key           string           // S3 object key: vaults/{vaultID}/files/{fileID}
    UserID        string           // User initiating upload
    VaultID       string           // Target vault
    FileID        string           // File being uploaded
    TotalSize     int64            // Total file size
    PartSize      int64            // Configured part size
    TotalParts    int              // Total parts to upload
    CompleteParts []CompletedPart  // Completed parts metadata
    Status        string           // "in_progress", "completed", "aborted"
    CreatedAt     time.Time        // Upload start time
    UpdatedAt     time.Time        // Last update time
    ExpiresAt     time.Time        // Automatic expiry time (24h)
}
```

#### CompletedPart

Records S3-provided metadata for each uploaded part:

```go
type CompletedPart struct {
    PartNumber int    // 1-based part number
    ETag       string // S3 ETag for integrity verification
    Size       int64  // Actual bytes uploaded
}
```

## API Endpoints

### Route Registration

Routes are registered in `cmd/api/main.go` under vault context:

```go
r.Route("/{vaultID}/files/{fileID}/multipart", func(r chi.Router) {
    r.Use(mw.RequireVaultPermission(rbacService, auth.PermUpdate))
    r.Post("/", storagepkg.HandleInitiateMultipart(multipartService))
    r.Get("/{uploadID}/part/{partNumber}", storagepkg.HandleGetPartURL(multipartService))
    r.Post("/{uploadID}/part", storagepkg.HandleCompletePart(multipartService))
    r.Post("/{uploadID}/complete", storagepkg.HandleFinalizeUpload(multipartService))
    r.Delete("/{uploadID}", storagepkg.HandleAbortUpload(multipartService))
    r.Get("/{uploadID}/progress", storagepkg.HandleGetProgress(multipartService))
})
```

### Middleware Stack

All multipart endpoints require:
1. **Authentication**: JWT token via `AuthMiddleware`
2. **Authorization**: Write permission on vault via `RequireVaultPermission`

### Endpoint Details

#### InitiateUpload

1. Validates total_size > 0
2. Calculates optimal part size (default 64MB, adjusted for very large files)
3. Creates S3 multipart upload via `CreateMultipartUpload()`
4. Returns upload metadata with TTL

**Flow**:
```
Client → POST /multipart {total_size}
         ↓
    Validate size > 0
         ↓
    Calculate parts: parts = ceil(size / 64MB)
         ↓
    If parts > 10,000: recalc partSize = ceil(size / 10,000)
         ↓
    Call s3.CreateMultipartUpload()
         ↓
    Store upload state in memory map
         ↓
    Return uploadID, part_size, total_parts, expires_at
```

#### GeneratePresignedPartURL

1. Validates upload exists and is "in_progress"
2. Validates part number (1-10,000)
3. Generates presigned URL valid for 15 minutes
4. Client uses this URL to upload directly to S3

**Flow**:
```
Client → GET /multipart/{uploadID}/part/{partNumber}
         ↓
    Lookup upload by uploadID
         ↓
    Validate status == "in_progress"
         ↓
    Validate 1 <= partNumber <= 10,000
         ↓
    Generate presigned UploadPart URL (15min expiry)
         ↓
    Return presigned_url
         ↓
    Client uploads to S3 directly
         ↓
    S3 returns ETag in response headers
```

#### CompletePart

1. Validates upload exists
2. Records part metadata (number, ETag, size)
3. Updates last modified timestamp

**Storage**:
```go
upload.CompleteParts = append(upload.CompleteParts, CompletedPart{
    PartNumber: partNumber,
    ETag:       etag,
    Size:       size,
})
```

#### FinalizeUpload

1. Validates upload exists
2. Collects all completed parts' ETags
3. Calls `CompleteMultipartUpload()` on S3
4. Updates status to "completed"
5. Cleans up (could add persistence here)

**Critical**: All parts must be recorded before finalization.

#### AbortUpload

1. Validates upload exists
2. Calls `AbortMultipartUpload()` on S3 to cleanup
3. Removes upload from in-memory map
4. Updates status to "aborted"

**Note**: Cleanup is best-effort; S3 parts are cleaned eventually.

#### GetProgress

1. Validates upload exists
2. Returns current state including:
   - Total/completed parts
   - Progress percentage
   - Expiry time
   - Current status

## Initialization

In `cmd/api/main.go`:

```go
// PH2-FIX: Initialize multipart upload service
multipartService := storagepkg.NewMultipartService(s3Client, s3Bucket)
```

**Startup**:
1. Creates MultipartService with S3 client reference
2. Spawns background goroutine for cleanup (1-hour interval)
3. Service ready to handle requests immediately

## Cleanup Strategy

### Automatic Expiry Cleanup

Background goroutine runs hourly:

```go
func (ms *MultipartService) cleanupExpiredUploads() {
    ticker := time.NewTicker(1 * time.Hour)
    defer ticker.Stop()

    for range ticker.C {
        ms.mu.Lock()
        now := time.Now()
        for id, upload := range ms.uploads {
            if upload.Status == "in_progress" && now.After(upload.ExpiresAt) {
                ms.s3Client.AbortMultipartUpload(ctx, ...) // Best-effort
                delete(ms.uploads, id)
            }
        }
        ms.mu.Unlock()
    }
}
```

**Benefits**:
- Prevents indefinite storage of abandoned uploads
- S3 also has server-side expiry (7 days default)
- In-memory cleanup reduces heap usage

**Limitations**:
- Service restart loses state (acceptable for in-progress uploads)
- Cleanup interval is fixed at 1 hour

### Future Enhancements

For production, consider:
1. **Database Persistence**: Store upload state in PostgreSQL
2. **Distributed Cleanup**: Use Redis for multi-instance coordination
3. **Metrics**: Track abandoned vs completed uploads
4. **Configurable TTL**: Per-upload or global expiry settings

## Security Considerations

### Authentication & Authorization

1. **JWT Required**: All endpoints check `user_id` from context
2. **Vault Permission**: `RequireVaultPermission` middleware enforces write access
3. **User Isolation**: Only upload initiator can access upload state (future improvement)

### Encryption

1. **In-Transit**: HTTPS only (enforced by middleware)
2. **At-Rest**: S3 SSE-AES256 enabled in all multipart uploads
3. **Keys**: Vault encryption keys separate from storage keys

### S3 Security

1. **Path Format**: `vaults/{vaultID}/files/{fileID}` prevents traversal
2. **Presigned URLs**: 15-minute window, single-part scope
3. **Access Control**: S3 bucket policy restricts access to server role only

### Validation

```go
// Validate components before S3 operations
func validateS3KeyComponent(component string) error {
    if strings.Contains(component, "..") ||
       strings.Contains(component, "/") {
        return fmt.Errorf("invalid S3 key component")
    }
    return nil
}
```

## Error Handling

### Server-Side Errors

| Error | Status | Action |
|-------|--------|--------|
| S3 connection failure | 500 | Retry with exponential backoff |
| Invalid upload ID | 404 | Return not found |
| Upload expired | 404 | Suggest restart |
| Part already complete | 400 | Idempotent: allow retry |
| All parts not uploaded | 400 | Return progress |

### Client-Side Recovery

```javascript
// Retry with exponential backoff
async function uploadWithRetry(part, maxAttempts = 3) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await uploadPart(part);
        } catch (error) {
            if (attempt === maxAttempts) throw error;
            const backoff = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
            await new Promise(r => setTimeout(r, backoff));
        }
    }
}
```

## Performance Characteristics

### Memory Usage

For each in-progress upload:
```
Overhead = ~500 bytes (struct)
          + ~200 bytes per completed part (ETag, metadata)

Example: 1GB file (16 parts @ 64MB)
         = 500 + (16 * 200)
         = ~3.7 KB per upload
```

### Scalability

- **Concurrent Uploads**: Limited by available goroutines (1 per in-memory entry)
- **Large Files**: No impact; only metadata stored
- **Many Users**: Thread-safe map handles concurrent access

### Optimization Opportunities

1. **LRU Eviction**: Evict oldest uploads if memory pressure
2. **Batch Operations**: Combine multiple part uploads into single S3 request
3. **Streaming**: Send parts directly without buffering
4. **Compression**: Compress parts for network efficiency

## Testing

### Unit Tests

See `multipart_test.go`:
- Part calculation logic
- State transitions
- S3 key construction
- Constants validation

### Integration Tests

Manual testing checklist:
1. [ ] Initiate 1GB upload → verify uploadID returned
2. [ ] Get part URL → verify presigned URL valid
3. [ ] Upload part via presigned URL → verify S3 success
4. [ ] Record part completion → verify state updated
5. [ ] Check progress → verify accurate percentages
6. [ ] Finalize upload → verify S3 object created
7. [ ] Verify encryption → check S3 object properties
8. [ ] Test abort → verify cleanup

### Load Testing

```bash
# Test 100 concurrent uploads of 1GB files
artillery load -n 100 -s 1GB multipart-test.yml

# Monitor service metrics
watch -n 1 'curl localhost:8080/metrics | grep multipart'
```

## Logging

All operations logged with PH2-FIX tag:

```
INFO  PH2-FIX: Multipart upload initiated
      upload_id=abc123 file_id=xyz789 total_size=1073741824

DEBUG PH2-FIX: Part completed
      upload_id=abc123 part=5 completed=5 total=16

INFO  PH2-FIX: Multipart upload finalized
      upload_id=abc123 file_id=xyz789

WARN  PH2-FIX: Aborting expired multipart upload
      upload_id=abc123
```

## Future Enhancements

1. **Database Persistence**
   - Store upload state in PostgreSQL
   - Survive service restarts
   - Enable multi-instance deployments

2. **WebSocket Updates**
   - Real-time progress via WebSocket
   - Push notifications on completion

3. **Checksum Verification**
   - SHA-256 of complete file
   - Verify integrity end-to-end

4. **Resume from Failure**
   - Provide resume tokens
   - Support partial re-uploads

5. **Metrics Integration**
   - Prometheus metrics for upload performance
   - Histogram of upload durations
   - Distribution of file sizes

## Troubleshooting

### Upload Stuck in "in_progress"

**Cause**: Client disconnected without calling finalize/abort

**Solution**:
1. Wait 24 hours for automatic expiry
2. Manually call DELETE /{uploadID} to abort
3. Check S3 incomplete multipart uploads: `aws s3api list-multipart-uploads --bucket qav-prod`

### S3 "Access Denied" on Presigned URL

**Cause**: Credentials expired or S3 bucket policy changed

**Solution**:
1. Verify S3 bucket policy allows server role
2. Check AWS credentials have required permissions
3. Regenerate presigned URL (valid 15 min)

### Memory Leak

**Cause**: Abandoned uploads not cleaned up

**Solution**:
1. Verify cleanup goroutine is running
2. Check service logs for cleanup messages
3. Manually abort old uploads: DELETE /{uploadID}
4. Implement database persistence for long-term stability

## References

- [AWS S3 Multipart Upload](https://docs.aws.amazon.com/AmazonS3/latest/userguide/uploadobjusingmpu.html)
- [AWS SDK v2 Go](https://aws.github.io/aws-sdk-go-v2/)
- [RFC 7616 - HTTP Authentication](https://tools.ietf.org/html/rfc7616)
