# Staging Readiness Center

Carton Artwork Studio separates **Staging Ready** from **Production Ready**.

A staging environment can be valid for integration / approval testing while Production Export remains intentionally blocked by missing print-production capabilities.

## Staging gate

System Management > Staging Readiness Center evaluates live server state.

Required checks:

- Cloudflare Access identity is used
- AUTH_BYPASS is disabled
- D1 binding is present
- D1 schema latest migration = `0008_pdfx_validation_runs.sql`
- required D1 tables are present
- R2 binding is present
- R2 write / read / delete deep probe has passed within 24 hours
- static Assets binding is present
- BOOTSTRAP_ADMIN_EMAIL has been removed
- at least one Approved Template Version exists
- at least one Active Factory Master exists
- at least one active OPERATOR exists
- at least one active REVIEWER exists
- OPERATOR / REVIEWER duties can be performed by at least two distinct active identities
- all four Production Policy records exist

Only when every staging check passes does the server return:

```text
STAGING_READY
```

## Production gate

Production is stricter.

```text
STAGING_READY
    +
BARCODE_POLICY approved + renderer supported
QR_POLICY approved + renderer supported
FONT_POLICY approved + renderer supported
PDFX_POLICY approved + renderer supported
    =
PRODUCTION_READY
```

Policy JSON cannot claim a renderer feature that does not exist.

Production also requires at least one approved FONT asset and one approved ICC_PROFILE asset. These asset approvals still do not enable renderer capability by themselves.

At v1.8 the production renderer deliberately reports:

- Code128-B: implemented
- QR ECC L/M/Q/H: implemented
- TrueType font embedding: implemented server-side
- font outlining: not implemented
- PDF/X-4 candidate generation: implemented
- externally validated PDF/X production profiles: none

Production therefore remains blocked by PDF/X conformance until an independent validation / print-acceptance gate is shipped.

## R2 deep probe

Admin can run **Run R2 Deep Probe**.

The Worker:

1. writes a random probe object to `ARTWORK_FILES`
2. reads it back
3. verifies the payload
4. deletes it
5. writes the probe result to D1
6. recalculates the complete staging report
7. stores an immutable-style readiness run
8. writes an Audit Log entry

No probe object is intentionally retained in R2.

## Factory readiness

The original three scaffold factories remain `SAMPLE` and never count as production master data.

Admin must create a real `ACTIVE` Factory in Content > Factories before Staging can become ready.

## Bootstrap removal

`BOOTSTRAP_ADMIN_EMAIL` is allowed only for initial environment bootstrap.

After normal D1 users and roles are created:

1. remove the GitHub / Wrangler bootstrap variable
2. redeploy staging
3. sign in as a normal Access + D1 Admin
4. run the R2 deep probe again

Staging remains blocked while bootstrap override is configured.

## Post-deploy GitHub smoke test

The manual staging deployment now runs `scripts/smoke-staging.mjs` after deploy.

Required GitHub Environment / Repository configuration:

Variables:

```text
CLOUDFLARE_D1_DATABASE_ID
CLOUDFLARE_R2_BUCKET_NAME
CLOUDFLARE_BOOTSTRAP_ADMIN_EMAIL
CLOUDFLARE_STAGING_URL
```

Secrets:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_ACCESS_CLIENT_ID
CLOUDFLARE_ACCESS_CLIENT_SECRET
```

The Access Client ID / Secret must belong to a Cloudflare Access Service Token allowed by the staging application's Service Auth policy.

The post-deploy smoke test verifies:

- service identity
- D1 binding
- R2 binding
- Assets binding
- AUTH_BYPASS is disabled
- unauthenticated `/api/me` does not pass through as an authenticated request

The full application-level readiness check is performed after sign-in by an Admin from the Readiness Center because application RBAC is user-based rather than service-token-based.


## Production Asset Registry

Font and ICC assets are managed under Quality > Assets.

See `docs/PRODUCTION_ASSETS.md`.


## PDF/X-4 Candidate

Candidate generation and its non-production boundary are documented in:

`docs/PDFX4_CANDIDATE.md`


## External PDF/X validator

Production Readiness now also checks whether `PDFX_VALIDATOR_URL` is configured.

This gate is separate from PDF/X profile capability: configuration alone does not make `PDF/X-4` production-ready.

See `docs/PDFX_VALIDATOR_BRIDGE.md`.
