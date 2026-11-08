# Pay-as-you-go credits

This branch prepares a credit wallet without activating payments or paid exports. One credit is 1,000 kobo (₦10). A basic export is 5 credits. Initial AI prices are estimates stored in `credit_pricing` and may use fixed, per-started-minute, and provider-specific components.

## Data and security model

`20261108090000_payg_credit_wallet.sql` creates configurable pricing, one wallet per user, an immutable double-entry-style credit ledger, payment records, export billing records, and a private administrative audit table. RLS permits authenticated users to read only their own wallet, ledger, payments, and exports. Browser roles cannot insert or update balances, payment verification, prices, settlement records, or audit events.

Every mutation runs in a database transaction. Wallet rows are locked before balance changes. A client-generated UUID makes export reservation idempotent. Gateway name/reference and provider transaction IDs make payment processing idempotent. Ledger idempotency keys provide a second duplicate-credit and duplicate-charge barrier.

The export states are `reserved`, `processing`, `verification_pending`, `settled`, `release_requested`, `released`, `failed`, and `refunded`. A browser may reserve credits and submit a hash/size/duration candidate. Only the service role may settle, release, refund, or credit a verified payment. User cancellation requests release; it does not release the reservation itself.

## Trusted completion requirement

The current editor renders entirely in the browser. JavaScript running on a user's device cannot provide trustworthy proof that a paid export completed, and withholding a locally rendered blob cannot prevent a modified client from accessing it. The prepared paid path therefore locks the normal download after rendering, records only an untrusted candidate, and leaves the charge reserved.

Paid exports must remain disabled until one of these reviewed protocols exists:

1. Upload the output to a private staging object using a short-lived, export-specific signed upload. A server worker verifies the object hash, media container, duration, size, owner, and reservation, then settles once and issues a short-lived download URL.
2. Move the final mux/render to a trusted worker, which stores the result privately, settles once, and returns a signed download URL.

The first option preserves browser processing but incurs temporary upload/storage bandwidth. It still cannot prove that a modified browser did useful editing; it proves that a valid output artifact exists. Settlement must use the migration's service-only function and a unique verifier receipt. A scheduled reconciler should release timed-out reservations and retry transient verification failures using the same idempotency keys.

### Cleanup worker configuration

Deploy a server-controlled worker with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as encrypted server secrets. It should call `billing_private.release_expired_exports(100)` every five minutes, repeat while the returned count is 100, and use bounded exponential backoff for transient failures. Only one run is required at a time, although `FOR UPDATE SKIP LOCKED` makes overlapping runs safe. Log the run ID, count, and error category without logging tokens or gateway payloads. Alert if the oldest active reservation is more than 35 minutes old or cleanup fails for 15 minutes.

Supabase Free projects may not have `pg_cron`. In that case, schedule the worker from the Preview host or an approved external scheduler and protect its route with a dedicated random secret. The route must reject browser sessions, must not accept an owner or export ID from its caller, and must invoke only the bounded cleanup RPC. Cleanup deployment is a separate activation step; no worker is deployed by this branch.

## Payment activation requirements

The payment provider interface is deliberately unconfigured. A selected Nigerian gateway adapter must create checkout references on the server, verify webhook signatures, confirm the reference directly with the gateway, compare integer amount/currency/owner, store a payload hash, and atomically record and credit the verified payment. Browser callbacks may show status but may never credit a wallet.

Before activation, configure server-only gateway secrets, webhook replay protection, reconciliation for pending/verified/refunded records, an administrative refund process, and alerts for amount or identity mismatches. Real collection requires explicit approval.

Three closed-by-default environment flags guard activation. `ECONTENT_EXPORT_BILLING_ENABLED`, `NEXT_PUBLIC_EXPORT_BILLING_ENABLED`, and `ECONTENT_PAYMENT_COLLECTION_ENABLED` must remain `disabled`. Code recognizes only the exact value `approved-live`; setting it is an activation action requiring review and approval.

## Review and rollout

The SQL file is review-only and has not been applied. Apply it first to an isolated local database, then the backed-up development project after approval. Validate ownership isolation, duplicate callbacks, insufficient balances, concurrent reservations, cancellation/timeout release, settlement replay, refunds, and reconciliation. Populate provider-specific AI pricing only after actual provider costs are known. Deploy a Preview with all activation flags disabled before any development payment sandbox is connected.
