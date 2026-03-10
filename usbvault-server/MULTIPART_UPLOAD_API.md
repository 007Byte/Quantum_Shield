# Multipart Upload API Documentation

## Overview

The Multipart Upload API enables efficient uploading of large files (>5GB) to the QAV vault storage system. It breaks large files into smaller parts that can be uploaded independently, with support for resumable uploads and progress tracking.

**Status**: PH2-FIX Implementation

## Features

- **Large File Support**: Upload files up to 5GB per part (theoretically unlimited total size)
- **Resumable Uploads**: Pause and resume uploads without losing progress
- **Progress Tracking**: Real-time progress monitoring
- **Parallel Part Upload**: Upload multiple parts in parallel
- **Automatic Cleanup**: Expired uploads are automatically aborted after 24 hours
- **S3-Compatible**: Works with AWS S3 and MinIO

## Constants

- **Minimum Part Size**: 5 MB (S3 requirement)
- **Default Part Size**: 64 MB (balances between request overhead and memory usage)
- **Maximum Parts**: 10,000 (S3 limit)
- **Upload Expiry TTL**: 24 hours

## Authentication

All multipart upload endpoints require JWT authentication via the `Authorization: Bearer {token}` header.

## Endpoints

### 1. Initiate Multipart Upload

Starts a new multipart upload and returns upload metadata.

```
POST /api/v1/vaults/{vaultID}/files/{fileID}/multipart
```

**Request Body**:
```json
{
  "total_size": 1073741824
}
```

**Parameters**:
- `vaultID` (string, path): The vault ID
- `fileID` (string, path): The file ID (UUID)
- `total_size` (int64, body): Total file size in bytes (must be positive)

**Response (201 Created)**:
```json
{
  "upload_id": "upload-abc123def456",
  "part_size": 67108864,
  "total_parts": 16,
  "expires_at": "2026-03-10T12:00:00Z"
}
```

**Errors**:
- `400 Bad Request`: Invalid request body or missing/invalid fields
- `401 Unauthorized`: Missing or invalid JWT token
- `403 Forbidden`: User lacks permission to access vault
- `500 Internal Server Error`: S3 service error

**Example**:
```bash
curl -X POST https://api.qav.vault/api/v1/vaults/vault-123/files/file-456/multipart \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"total_size": 1073741824}'
```

### 2. Get Presigned Part URL

Generates a presigned URL for uploading a specific part to S3.

```
GET /api/v1/vaults/{vaultID}/files/{fileID}/multipart/{uploadID}/part/{partNumber}
```

**Parameters**:
- `vaultID` (string, path): The vault ID
- `fileID` (string, path): The file ID
- `uploadID` (string, path): The upload ID from initiation
- `partNumber` (int, path): Part number (1-based, max 10,000)

**Response (200 OK)**:
```json
{
  "presigned_url": "https://s3.example.com/bucket/vaults/...?AWSAccessKeyId=...",
  "upload_id": "upload-abc123def456"
}
```

**Presigned URL Validity**: 15 minutes

**Errors**:
- `400 Bad Request`: Invalid part number
- `401 Unauthorized`: Missing or invalid JWT token
- `404 Not Found`: Upload not found or already completed
- `500 Internal Server Error`: S3 service error

**Example**:
```bash
curl -X GET https://api.qav.vault/api/v1/vaults/vault-123/files/file-456/multipart/upload-abc123/part/1 \
  -H "Authorization: Bearer $TOKEN"
```

### 3. Record Part Completion

Notifies the server that a part has been successfully uploaded to S3. Must be called after uploading each part.

```
POST /api/v1/vaults/{vaultID}/files/{fileID}/multipart/{uploadID}/part
```

**Request Body**:
```json
{
  "part_number": 1,
  "etag": "5d41402abc4b2a76b9719d911017c592",
  "size": 67108864
}
```

**Parameters**:
- `uploadID` (string, path): The upload ID
- `part_number` (int, body): Part number (1-based)
- `etag` (string, body): The ETag returned by S3 after upload
- `size` (int64, body): Actual size of the uploaded part

**Response (200 OK)**:
```json
{
  "status": "part_recorded"
}
```

**Errors**:
- `400 Bad Request`: Invalid part number, missing ETag, or invalid size
- `401 Unauthorized`: Missing or invalid JWT token
- `404 Not Found`: Upload not found
- `500 Internal Server Error`: Database error

**Example**:
```bash
curl -X POST https://api.qav.vault/api/v1/vaults/vault-123/files/file-456/multipart/upload-abc123/part \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "part_number": 1,
    "etag": "5d41402abc4b2a76b9719d911017c592",
    "size": 67108864
  }'
```

### 4. Finalize Multipart Upload

Completes the multipart upload by combining all parts into a single file. Call this after all parts have been uploaded.

```
POST /api/v1/vaults/{vaultID}/files/{fileID}/multipart/{uploadID}/complete
```

**Parameters**:
- `uploadID` (string, path): The upload ID

**Response (200 OK)**:
```json
{
  "status": "completed"
}
```

**Errors**:
- `401 Unauthorized`: Missing or invalid JWT token
- `404 Not Found`: Upload not found
- `500 Internal Server Error`: S3 service error

**Example**:
```bash
curl -X POST https://api.qav.vault/api/v1/vaults/vault-123/files/file-456/multipart/upload-abc123/complete \
  -H "Authorization: Bearer $TOKEN"
```

### 5. Get Upload Progress

Returns current progress of a multipart upload.

```
GET /api/v1/vaults/{vaultID}/files/{fileID}/multipart/{uploadID}/progress
```

**Parameters**:
- `uploadID` (string, path): The upload ID

**Response (200 OK)**:
```json
{
  "upload_id": "upload-abc123def456",
  "status": "in_progress",
  "total_parts": 16,
  "completed_parts": 7,
  "total_size": 1073741824,
  "progress_pct": 43.75,
  "expires_at": "2026-03-10T12:00:00Z"
}
```

**Errors**:
- `401 Unauthorized`: Missing or invalid JWT token
- `404 Not Found`: Upload not found
- `500 Internal Server Error`: Database error

**Example**:
```bash
curl -X GET https://api.qav.vault/api/v1/vaults/vault-123/files/file-456/multipart/upload-abc123/progress \
  -H "Authorization: Bearer $TOKEN"
```

### 6. Abort Multipart Upload

Cancels an in-progress multipart upload and cleans up resources.

```
DELETE /api/v1/vaults/{vaultID}/files/{fileID}/multipart/{uploadID}
```

**Parameters**:
- `uploadID` (string, path): The upload ID

**Response (200 OK)**:
```json
{
  "status": "aborted"
}
```

**Errors**:
- `401 Unauthorized`: Missing or invalid JWT token
- `404 Not Found`: Upload not found
- `500 Internal Server Error`: S3 service error

**Example**:
```bash
curl -X DELETE https://api.qav.vault/api/v1/vaults/vault-123/files/file-456/multipart/upload-abc123 \
  -H "Authorization: Bearer $TOKEN"
```

## Usage Workflow

### Complete Upload Flow

```
1. POST /multipart               → Get uploadID and part_size
2. For each part {
     3. GET /multipart/{uploadID}/part/{partNumber}  → Get presigned URL
     4. PUT {presigned_url} with part data           → Upload to S3 (client-side)
     5. POST /multipart/{uploadID}/part              → Record part completion
   }
6. POST /multipart/{uploadID}/complete               → Finalize upload
```

### Resume Interrupted Upload

```
1. GET /multipart/{uploadID}/progress                → Check completed parts
2. For remaining parts {
     3. GET /multipart/{uploadID}/part/{partNumber}  → Get presigned URL
     4. PUT {presigned_url} with part data           → Upload to S3
     5. POST /multipart/{uploadID}/part              → Record part completion
   }
6. POST /multipart/{uploadID}/complete               → Finalize upload
```

## Client Implementation Example (JavaScript)

```javascript
// Initiate upload
const initiateResponse = await fetch(
  `/api/v1/vaults/${vaultID}/files/${fileID}/multipart`,
  {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ total_size: file.size })
  }
);
const { upload_id, part_size } = await initiateResponse.json();

// Upload each part
for (let partNumber = 1; partNumber <= Math.ceil(file.size / part_size); partNumber++) {
  // Get presigned URL
  const urlResponse = await fetch(
    `/api/v1/vaults/${vaultID}/files/${fileID}/multipart/${upload_id}/part/${partNumber}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  const { presigned_url } = await urlResponse.json();

  // Upload part to S3
  const start = (partNumber - 1) * part_size;
  const end = Math.min(start + part_size, file.size);
  const chunk = file.slice(start, end);

  const uploadResponse = await fetch(presigned_url, {
    method: 'PUT',
    body: chunk
  });
  const etag = uploadResponse.headers.get('etag').replace(/"/g, '');

  // Record part completion
  await fetch(
    `/api/v1/vaults/${vaultID}/files/${fileID}/multipart/${upload_id}/part`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        part_number: partNumber,
        etag,
        size: end - start
      })
    }
  );
}

// Finalize upload
await fetch(
  `/api/v1/vaults/${vaultID}/files/${fileID}/multipart/${upload_id}/complete`,
  {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  }
);
```

## Error Handling

### Common Error Codes

| Code | Message | Cause | Action |
|------|---------|-------|--------|
| 400 | Invalid request body | Malformed JSON or missing fields | Check request format |
| 401 | Unauthorized | Missing/invalid JWT token | Provide valid token |
| 403 | Access denied | User lacks vault permission | Verify vault access |
| 404 | Not found | Upload ID invalid or expired | Restart upload |
| 500 | Internal error | Server-side error | Retry operation |

### Retry Strategy

```javascript
async function retryOperation(operation, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      const backoff = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      await new Promise(resolve => setTimeout(resolve, backoff));
    }
  }
}
```

## Security Considerations

1. **Presigned URLs**: Valid for 15 minutes only. Request new URLs if needed.
2. **Upload Expiry**: All uploads expire after 24 hours of inactivity.
3. **Encryption**: Files are encrypted at rest in S3 (SSE-AES256).
4. **Authentication**: All endpoints require valid JWT authentication.
5. **Vault Permission**: User must have write permission on the vault.

## Performance Notes

- **Part Size**: Default 64MB balances bandwidth and request overhead
- **Parallel Upload**: Upload multiple parts in parallel for faster transfer
- **Network Stability**: Long uploads on unstable networks can be resumed
- **S3 Limits**: S3 allows up to 10,000 parts per upload

## Monitoring

The multipart service logs key events:
- Upload initiation
- Part completion
- Upload finalization
- Expiry cleanup

Query logs for PH2-FIX tags to monitor multipart upload activity.
