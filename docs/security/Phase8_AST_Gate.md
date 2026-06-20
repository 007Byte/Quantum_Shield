# Phase 8 AST Gate: Billing & Subscription Management

**Date:** 2026-03-12
**Status:** PASS
**Phase:** 8 -- Billing & Subscription Management

---

## Security Controls Verified

### 1. Webhook HMAC Verification: SHA-256 Signature Check

- **File:** `usbvault-server/internal/billing/service.go` (`verifyStripeSignature`)
- **Control:** All incoming Stripe webhook requests MUST pass HMAC-SHA256 signature verification before any event processing occurs.
- **Implementation:**
  - Parses Stripe `t=timestamp,v1=signature` header format
  - Computes expected HMAC-SHA256 over `timestamp + "." + payload` using `STRIPE_WEBHOOK_SECRET`
  - Rejects requests with missing signature header (HTTP 401)
  - Rejects requests with invalid/tampered signatures (HTTP 401)
  - Rejects requests with timestamps older than 5 minutes (replay protection)
  - Returns HTTP 500 if `STRIPE_WEBHOOK_SECRET` environment variable is not configured
- **Test coverage:** `webhook_test.go` -- `TestValidHMACSignaturePasses`, `TestInvalidHMACSignatureFails`, `TestMissingSignatureHeaderFails`, `TestEmptyWebhookSecretReturnsError`, `TestMalformedPayloadReturnsError`

### 2. No Tier Bypass: Middleware Enforces on Every Request

- **File:** `usbvault-server/internal/middleware/auth.go` (`RequireTier`)
- **File:** `usbvault-server/internal/middleware/feature_gate.go` (`RequireFeature`)
- **Control:** Tier-gated endpoints enforce subscription tier checks via middleware applied at the router level. There is no code path that bypasses the tier check.
- **Implementation:**
  - `RequireTier` queries the user's subscription tier from the database on every request
  - Falls back to `free` tier when no active subscription is found (fail-closed)
  - Returns HTTP 403 with JSON body containing `required_tier` and `current_tier` for transparency
  - Sets `X-Required-Tier` and `X-Current-Tier` response headers for observability
  - `RequireFeature` provides granular per-feature gating with the same fail-closed behavior
  - Tier hierarchy strictly enforced: free (0) < individual (1) < team (2) < enterprise (3)
- **Test coverage:** `tier_test.go` -- `TestCompareTiers`, `TestTierHierarchyCompleteness`, `TestMissingTierDefaultsToFree`, `TestFreeUserBlockedFromTeamFeature`, `TestEnterpriseUserAllowedEverything`

### 3. Subscription Data Not Leaked to Other Users

- **File:** `usbvault-server/internal/billing/service.go` (`HandleGetSubscription`, `HandleCancelSubscription`, `HandleReactivateSubscription`)
- **Control:** All billing endpoints extract `user_id` from the authenticated JWT context, not from request parameters. A user can only access their own subscription data.
- **Implementation:**
  - `user_id` is extracted via `r.Context().Value("user_id")` which is set by `AuthMiddleware` from the validated JWT
  - All database queries filter by `WHERE user_id = $1` using the JWT-derived user ID
  - No endpoint accepts a user ID as a URL parameter or request body field
  - Webhook handlers look up `user_id` from `stripe_customer_id`, never from external input
- **Verification:** Manual audit of all handler functions confirms no user_id parameter injection point

### 4. Stripe API Keys Not Exposed to Client

- **File:** `usbvault-server/internal/billing/service.go` (`StripeConfig`)
- **File:** `.env.example`
- **Control:** Stripe secret key (`sk_*`) and webhook secret (`whsec_*`) are server-side only. The client never receives or transmits these values.
- **Implementation:**
  - `STRIPE_SECRET_KEY` is loaded from environment variables at server startup
  - Used only in server-to-Stripe HTTP requests via `req.SetBasicAuth(bs.apiKey, "")`
  - Checkout/Portal session handlers return only the Stripe-hosted URL, never the API key
  - Client-side code (`api.ts`) uses only relative API paths; no Stripe keys referenced
  - `StripeConfig.PublishableKey` (pk_*) is the only key safe for client exposure, and it is not currently sent
- **Verification:** `grep -r "STRIPE_SECRET_KEY\|sk_live\|sk_test" usbvault-app/` returns zero matches in client code

### 5. Checkout Session Includes CSRF Protection

- **File:** `usbvault-server/internal/billing/service.go` (`HandleCreateCheckoutSession`)
- **File:** `usbvault-server/internal/middleware/security.go` (security headers)
- **Control:** Checkout session creation requires an authenticated JWT (CSRF protection via bearer token), and the session metadata includes the `user_id` for server-side validation.
- **Implementation:**
  - `HandleCreateCheckoutSession` is behind `RequireAuth` middleware -- only authenticated users can create sessions
  - Stripe Checkout session includes `metadata[user_id]` and `metadata[tier]` for webhook reconciliation
  - CORS middleware restricts allowed origins (no wildcards for HTTPS)
  - Security headers middleware sets `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`
  - Webhook endpoint uses signature verification instead of JWT (Stripe cannot present a JWT)

---

## Additional Security Properties

### Dual-Mode Operation (Stripe + Local)

- **Control:** The billing service operates in two modes -- real Stripe API calls when `STRIPE_SECRET_KEY` is configured, and local database-only mode for development.
- **Security:** `isLiveStripeKey()` rejects empty strings and common placeholder patterns. Local mode generates predictable `local_cust_*` / `local_sub_*` IDs that are clearly distinguishable from real Stripe IDs.
- **Risk:** Local mode must never be used in production. Environment validation should enforce this.

### Webhook Event Handling

- **Control:** All five critical subscription lifecycle events are handled:
  - `customer.subscription.created` -- activates tier
  - `customer.subscription.updated` -- updates tier/status
  - `customer.subscription.deleted` -- downgrades to cancelled
  - `invoice.payment_failed` -- marks as `past_due`
  - `invoice.paid` / `invoice.payment_succeeded` -- confirms active status
- **Security:** Unknown event types are logged and ignored (no-op). Malformed payloads return HTTP 400 before any database mutation.

### Cancellation Grace Period

- **Control:** `HandleCancelSubscription` sets status to `cancelling` with `cancel_at_period_end = true`. The user retains access until the period ends. `HandleReactivateSubscription` reverses the cancellation.
- **Security:** Only subscriptions in `cancelling` state can be reactivated, preventing state manipulation.

---

## Gate Verdict

All five security controls pass verification. Phase 8 billing integration is approved for merge.
