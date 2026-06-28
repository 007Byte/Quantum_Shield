# ADR-008: S3-Compatible Storage for Encrypted Blobs

## Status: Accepted

## Date: 2024-03-01

## Context

Quantum_Shield users store encrypted documents and file attachments. Requirements:

- Serve large files (up to 100MB) without loading entire file in memory
- Multipart upload for resumable uploads (network resilience)
- Support on-premises deployment (S3-compatible API, not AWS-specific)
- Compliance: versioning, lifecycle policies, MFA delete
- Cost-efficient for storage at scale

Alternatives: PostgreSQL BLOB columns, filesystem storage, Google Cloud Storage.

## Decision

Use **S3-compatible storage** (AWS S3 API) with:

1. **Bucket Structure**:
   - `qav-vaults/{user_id}/{vault_id}/documents/`
   - `qav-vaults/{user_id}/{vault_id}/attachments/`
   - Encryption at rest enabled (SSE-S3 or SSE-KMS, backend controls)

2. **Client Upload Flow**:
   - Client initiates multipart upload: `POST /api/v1/uploads`
   - Backend returns pre-signed POST URLs for parts (chunked upload)
   - Client uploads parts in parallel (5-10 concurrent)
   - Client completes upload: `POST /api/v1/uploads/{id}/complete`
   - Backend combines parts server-side

3. **Metadata Storage**:
   - PostgreSQL stores file metadata (name, size, content-hash)
   - S3 stores encrypted blob under object key derived from hash
   - Deduplication via content-addressable storage (same file = same key)

## Alternatives Considered

1. **PostgreSQL BLOB columns (bytea)**
   - Pros: Single data store, transactional consistency
   - Cons: Database size grows unbounded, backup/restore slower, poor streaming performance, not suitable for 100MB+ files

2. **Filesystem storage**
   - Pros: Simple, no external dependency
   - Cons: Single-machine deployment, no HA, manual backup complexity, permission management fragile

3. **Google Cloud Storage**
   - Pros: Excellent integration with Google Cloud
   - Cons: AWS-specific (GCS not S3-compatible), vendor lock-in, not available on-premises

## Consequences

### Positive Outcomes

- Multipart upload enables resumable transfers (network failures safe)
- Deduplication reduces storage costs (many vaults share same attachments)
- On-premises support via MinIO (S3-compatible, open-source)
- Lifecycle policies automate archival/deletion after 90 days
- Streaming downloads avoid loading entire file in memory
- S3 versioning enables accidental deletion recovery

### Negative Outcomes

- Additional infrastructure dependency (S3 or MinIO cluster)
- Separate blob storage from relational database (eventual consistency)
- Cost: pay for storage + data transfer (egress charges)
- Orphaned blobs possible if metadata delete fails (requires cleanup job)
- Network latency for small files (mitigated: metadata cache in PostgreSQL)

## Implementation Notes

- Multipart upload API:
  - `POST /api/v1/uploads` → returns `{upload_id, parts: [{url, part_number}]}`
  - Client uploads parts to presigned URLs
  - `POST /api/v1/uploads/{id}/complete` → backend calls S3 CompleteMultipartUpload

- Encryption at application layer before S3 upload (optional):
  - Large files encrypted with XChaCha20-Poly1305 chunked mode
  - Nonce per chunk to prevent side-channel attacks
  - HMAC-SHA256 signature of ciphertext stored in PostgreSQL

- Cleanup job (nightly):
  - Find blobs in S3 without corresponding PostgreSQL record
  - Delete orphaned objects (retry 3 times, then manual review)

- Presigned URL expiry: 15 minutes for GET, 1 hour for multipart PUT
