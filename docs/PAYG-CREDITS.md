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

## Flutterwave Test Mode

Econtent uses Flutterwave Standard checkout. The authenticated server creates an `ect_test_…` reference and pending record, sends only an approved top-up amount to Flutterwave, and returns the hosted HTTPS checkout URL. The webhook validates the `flutterwave-signature` HMAC over the exact raw request body and then independently calls Flutterwave transaction verification. The verified reference, exact NGN amount, provider transaction ID, payment time, and payload hash are passed to one atomic service-role RPC. Browser redirects never credit a wallet.

The implementation was informed by the existing `PCGHub/PCGH` checkout and verification flow. Its credentials and database writes were not copied. Econtent uses separate environment names, references, tables, webhook configuration, and atomic wallet accounting.

For a Preview test, configure these server variables: `FLUTTERWAVE_MODE=test`, an Econtent-specific `FLUTTERWAVE_SECRET_KEY` beginning with `FLWSECK_TEST-`, an Econtent-specific `FLUTTERWAVE_SECRET_HASH` of at least 16 characters, `ECONTENT_APP_URL` set to the Preview origin, `SUPABASE_SERVICE_ROLE_KEY`, and `ECONTENT_PAYMENT_COLLECTION_ENABLED=flutterwave-test`. Set `NEXT_PUBLIC_FLUTTERWAVE_TEST_ENABLED=true` only in that Preview. Configure Flutterwave's Test Mode webhook URL as `https://<preview-origin>/api/billing/payments/webhook` and use the exact same secret hash. Never place either Flutterwave secret or the Supabase service-role key in a `NEXT_PUBLIC_` variable.

Live keys are rejected by code. Real collection remains disabled. Before live activation, add scheduled reconciliation for pending records using `verifyReference`, operational alerts, a reviewed refund workflow, key rotation instructions, and a separate explicit live-mode change.

Before activation, configure server-only gateway secrets, webhook replay protection, reconciliation for pending/verified/refunded records, an administrative refund process, and alerts for amount or identity mismatches. Real collection requires explicit approval.

Export billing remains closed behind the exact `approved-live` value for `ECONTENT_EXPORT_BILLING_ENABLED` and `NEXT_PUBLIC_EXPORT_BILLING_ENABLED`. Test payments use the distinct `flutterwave-test` value and accept only a Flutterwave Test Mode secret. No code path currently accepts a live Flutterwave key.

## Review and rollout

The SQL file is review-only and has not been applied. Apply it first to an isolated local database, then the backed-up development project after approval. Validate ownership isolation, duplicate callbacks, insufficient balances, concurrent reservations, cancellation/timeout release, settlement replay, refunds, and reconciliation. Populate provider-specific AI pricing only after actual provider costs are known. Deploy a Preview with all activation flags disabled before any development payment sandbox is connected.
