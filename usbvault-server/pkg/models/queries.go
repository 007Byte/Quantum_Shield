package models

// User queries
const (
	QueryCreateUser = `
		INSERT INTO users (id, email_hash, srp_verifier, srp_salt, public_key, created_at, updated_at, subscription_tier)
		VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), 'free')
		RETURNING id
	`

	QueryGetUserByEmailHash = `
		SELECT id, email_hash, srp_verifier, srp_salt, public_key, created_at, updated_at, subscription_tier
		FROM users
		WHERE email_hash = $1
	`

	QueryGetUserByID = `
		SELECT id, email_hash, srp_verifier, srp_salt, public_key, created_at, updated_at, subscription_tier
		FROM users
		WHERE id = $1
	`

	QueryUpdateUserPublicKey = `
		UPDATE users
		SET public_key = $1, updated_at = NOW()
		WHERE id = $2
	`
)

// Vault queries
const (
	QueryCreateVault = `
		INSERT INTO vaults (id, owner_id, encrypted_metadata, created_at, updated_at)
		VALUES ($1, $2, $3, NOW(), NOW())
		RETURNING id
	`

	QueryListVaults = `
		SELECT id, owner_id, encrypted_metadata, created_at, updated_at
		FROM vaults
		WHERE owner_id = $1 AND deleted_at IS NULL
		ORDER BY created_at DESC
	`

	QueryGetVault = `
		SELECT id, owner_id, encrypted_metadata, created_at, updated_at
		FROM vaults
		WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL
	`

	QueryUpdateVaultMetadata = `
		UPDATE vaults
		SET encrypted_metadata = $1, updated_at = NOW()
		WHERE id = $2 AND owner_id = $3
	`

	QuerySoftDeleteVault = `
		UPDATE vaults
		SET deleted_at = NOW()
		WHERE id = $1 AND owner_id = $2
	`
)

// Blob queries
const (
	QueryCreateBlob = `
		INSERT INTO blobs (id, vault_id, s3_key, size_bytes, created_at)
		VALUES ($1, $2, $3, $4, NOW())
		RETURNING id
	`

	QueryListBlobsByVault = `
		SELECT id, vault_id, s3_key, size_bytes, created_at
		FROM blobs
		WHERE vault_id = $1
		ORDER BY created_at DESC
	`

	QueryDeleteBlob = `
		DELETE FROM blobs
		WHERE id = $1 AND vault_id = $2
	`
)

// ShareRecord queries
const (
	QueryCreateShare = `
		INSERT INTO share_records (id, sender_id, recipient_id, blob_id, encrypted_key, created_at, expires_at)
		VALUES ($1, $2, $3, $4, $5, NOW(), $6)
		RETURNING id
	`

	QueryListReceivedShares = `
		SELECT id, sender_id, recipient_id, blob_id, encrypted_key, created_at, expires_at
		FROM share_records
		WHERE recipient_id = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())
		ORDER BY created_at DESC
	`

	QueryListSentShares = `
		SELECT id, sender_id, recipient_id, blob_id, encrypted_key, created_at, expires_at
		FROM share_records
		WHERE sender_id = $1 AND revoked_at IS NULL
		ORDER BY created_at DESC
	`

	QueryRevokeShare = `
		UPDATE share_records
		SET revoked_at = NOW()
		WHERE id = $1 AND sender_id = $2
	`

	QueryGetSharesByID = `
		SELECT id, sender_id, recipient_id, blob_id, encrypted_key, created_at, expires_at
		FROM share_records
		WHERE id = $1
	`
)

// AuditEntry queries
const (
	QueryCreateAuditEntry = `
		INSERT INTO audit_log (user_id, action_type, encrypted_detail, timestamp, prev_hash, hash)
		VALUES ($1, $2, $3, $4, $5, $6)
	`

	QueryListAuditEntries = `
		SELECT id, user_id, action_type, timestamp, hash
		FROM audit_log
		WHERE user_id = $1
		ORDER BY id DESC
		LIMIT $2 OFFSET $3
	`

	QueryGetLastAuditHash = `
		SELECT hash FROM audit_log
		WHERE user_id = $1
		ORDER BY id DESC
		LIMIT 1
	`
)

// PublicKey queries
const (
	QueryCreatePublicKey = `
		INSERT INTO public_keys (user_id, key_type, public_key_bytes, created_at)
		VALUES ($1, $2, $3, NOW())
	`

	QueryGetUserPublicKey = `
		SELECT public_key_bytes FROM public_keys
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT 1
	`
)

// Session queries
const (
	QueryCreateSession = `
		INSERT INTO sessions (id, user_id, device_id, token_hash, expires_at, created_at)
		VALUES ($1, $2, $3, $4, $5, NOW())
	`

	QueryGetSession = `
		SELECT id, user_id, device_id, token_hash, expires_at, created_at
		FROM sessions
		WHERE id = $1
	`

	QueryValidateSession = `
		SELECT id, user_id, device_id
		FROM sessions
		WHERE id = $1 AND expires_at > NOW()
	`

	QueryInvalidateSession = `
		DELETE FROM sessions
		WHERE id = $1
	`
)

// Device queries
const (
	QueryCreateDevice = `
		INSERT INTO devices (user_id, device_token, platform, registered_at)
		VALUES ($1, $2, $3, NOW())
		ON CONFLICT (user_id, device_token) DO UPDATE SET platform = $3
	`

	QueryListDevices = `
		SELECT id, user_id, device_token, platform, registered_at
		FROM devices
		WHERE user_id = $1
	`

	QueryDeleteDevice = `
		DELETE FROM devices
		WHERE id = $1 AND user_id = $2
	`
)

// Subscription queries
const (
	QueryCreateSubscription = `
		INSERT INTO subscriptions (id, user_id, stripe_customer_id, stripe_subscription_id, tier, status, current_period_end, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
	`

	QueryGetSubscription = `
		SELECT id, user_id, stripe_customer_id, stripe_subscription_id, tier, status, current_period_end, cancelled_at, created_at, updated_at
		FROM subscriptions
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT 1
	`

	QueryUpdateSubscription = `
		UPDATE subscriptions
		SET tier = $1, status = $2, current_period_end = $3, updated_at = NOW()
		WHERE user_id = $4
	`

	QueryCancelSubscription = `
		UPDATE subscriptions
		SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
		WHERE stripe_subscription_id = $1
	`
)

// VaultMember queries
const (
	QueryAddVaultMember = `
		INSERT INTO vault_members (vault_id, user_id, encrypted_key, role, invited_at)
		VALUES ($1, $2, $3, $4, NOW())
	`

	QueryListVaultMembers = `
		SELECT id, vault_id, user_id, encrypted_key, role, invited_at, accepted_at
		FROM vault_members
		WHERE vault_id = $1
	`

	QueryRemoveVaultMember = `
		DELETE FROM vault_members
		WHERE vault_id = $1 AND user_id = $2
	`

	QueryAcceptVaultInvite = `
		UPDATE vault_members
		SET accepted_at = NOW()
		WHERE vault_id = $1 AND user_id = $2
	`

	QueryGetVaultMember = `
		SELECT id, vault_id, user_id, encrypted_key, role, invited_at, accepted_at
		FROM vault_members
		WHERE vault_id = $1 AND user_id = $2
	`

	QueryUpdateVaultMemberRole = `
		UPDATE vault_members
		SET role = $1
		WHERE vault_id = $2 AND user_id = $3
	`
)

// Additional User queries
const (
	QueryUpdateUserTier = `
		UPDATE users
		SET subscription_tier = $1, updated_at = NOW()
		WHERE id = $2
	`

	QueryDeleteUser = `
		UPDATE users
		SET deleted_at = NOW(), updated_at = NOW()
		WHERE id = $1
	`

	QueryGetUserRole = `
		SELECT role FROM vault_members
		WHERE vault_id = $1 AND user_id = $2
	`
)

// Additional Blob queries
const (
	QueryGetBlob = `
		SELECT id, vault_id, s3_key, size_bytes, created_at
		FROM blobs
		WHERE id = $1
	`

	QueryUpdateBlobSize = `
		UPDATE blobs
		SET size_bytes = $1
		WHERE id = $2
	`

	QueryListExpiredBlobs = `
		SELECT id, vault_id, s3_key, size_bytes, created_at
		FROM blobs
		WHERE expires_at < NOW() AND deleted_at IS NULL
		LIMIT $1
	`

	QuerySoftDeleteBlob = `
		UPDATE blobs
		SET deleted_at = NOW(), deleted_by = $1
		WHERE id = $2
	`
)

// Batch queries
const (
	QueryGetMultipleUsers = `
		SELECT id, email_hash, srp_verifier, srp_salt, public_key, created_at, updated_at, subscription_tier
		FROM users
		WHERE id = ANY($1)
	`

	QueryGetMultipleVaults = `
		SELECT id, owner_id, encrypted_metadata, created_at, updated_at
		FROM vaults
		WHERE id = ANY($1) AND deleted_at IS NULL
	`

	QueryGetMultipleBlobs = `
		SELECT id, vault_id, s3_key, size_bytes, created_at
		FROM blobs
		WHERE id = ANY($1)
	`
)

// Search and filter queries
const (
	QuerySearchVaults = `
		SELECT id, owner_id, encrypted_metadata, created_at, updated_at
		FROM vaults
		WHERE owner_id = $1 AND deleted_at IS NULL
		AND created_at >= $2
		ORDER BY created_at DESC
		LIMIT $3 OFFSET $4
	`

	QueryCountVaultsByOwner = `
		SELECT COUNT(*) FROM vaults
		WHERE owner_id = $1 AND deleted_at IS NULL
	`

	QueryCountBlobsByVault = `
		SELECT COUNT(*) FROM blobs
		WHERE vault_id = $1 AND deleted_at IS NULL
	`

	QueryCountSharesByUser = `
		SELECT COUNT(*) FROM share_records
		WHERE (sender_id = $1 OR recipient_id = $1) AND revoked_at IS NULL
	`
)

// Cleanup queries
const (
	QueryCleanupExpiredShares = `
		UPDATE share_records
		SET revoked_at = NOW()
		WHERE expires_at < NOW() AND revoked_at IS NULL
	`

	QueryCleanupExpiredSessions = `
		DELETE FROM sessions
		WHERE expires_at < NOW()
	`

	QueryGetCleanupStats = `
		SELECT
			(SELECT COUNT(*) FROM share_records WHERE expires_at < NOW() AND revoked_at IS NULL) as expired_shares,
			(SELECT COUNT(*) FROM sessions WHERE expires_at < NOW()) as expired_sessions,
			(SELECT COUNT(*) FROM blobs WHERE deleted_at IS NOT NULL AND created_at < NOW() - INTERVAL '90 days') as old_deleted_blobs
	`
)
