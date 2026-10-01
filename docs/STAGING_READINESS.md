# Staging Readiness Center

Carton Artwork Studio separates **Staging Ready** from **Production Ready**.

A staging environment can be valid for integration / approval testing while Production Export remains intentionally blocked by missing print-production capabilities.

## Staging gate

System Management > Staging Readiness Center evaluates live server state.

Required checks:

- Cloudflare Access identity is used
- AUTH_BYPASS is disabled
- D1 binding is present
- D1 schema latest migration = `0009_pdfx_promotion_evidence.sql`
- required D1 tables are present
- Artifact Store binding is present (KV or R2)
- Artifact Store write / read / delete deep probe has passed within 24 hours
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

Production also requires at least one approved FONT asset and one approved ICC_PROFILE asset.

For v2 staging, the Artifact Store may be Workers KV. **Production requires R2 explicitly.** A KV-backed environment can reach `STAGING_READY` but cannot reach `PRODUCTION_READY`. These asset approvals still do not enable renderer capability by themselves.

At v1.8 the production renderer deliberately reports:

- Code128-B: implemented
- QR ECC L/M/Q/H: implemented
- TrueType font embedding: implemented server-side
- font outlining: not implemented
- PDF/X-4 candidate generation: implemented
- externally validated PDF/X production profiles: none

Production therefore remains blocked by PDF/X conformance until an independent validation / print-acceptance gate is shipped.

## Artifact Store deep probe

Admin can run **Run Artifact Store Probe**.

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
4. run the Artifact Store deep probe again

Staging remains blocked while bootstrap override is configured.

## Post-deploy GitHub smoke test

The manual staging deployment now runs `scripts/smoke-staging.mjs` after deploy.

Required GitHub Environment / Repository configuration:

Variables:

```text
CLOUDFLARE_D1_DATABASE_ID
CLOUDFLARE_KV_NAMESPACE_ID
CLOUDFLARE_BOOTSTRAP_ADMIN_EMAIL
CLOUDFLARE_STAGING_URL
```

Secrets:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_ACCESS_CLIENT_ID
CLOUDFLARE_ACCESS_CLIENT_SECRET
CLOUDFLARE_PDFX_VALIDATOR_TOKEN
```

The Access Client ID / Secret must belong to a Cloudflare Access Service Token allowed by the staging application's Service Auth policy.

The post-deploy smoke test verifies:

- service identity
- D1 binding
- Artifact Store binding
- Assets binding
- trusted PDF/X validator URL + Worker bearer secret are configured
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


## v2.0 final staging acceptance

The final staging deployment is serialized so two manual staging deployments cannot race each other.

A successful post-deploy smoke test must additionally verify:

- deployed app version is `2.0.0`;
- promotion policy version is `2.0.0`;
- trusted validator URL + bearer secret are visible to the Worker as configured;
- the pinned ruleset ID/version/SHA are exposed by `/api/health`.

The workflow uploads:

`staging-acceptance-<git-sha>`

containing `artifacts/staging-acceptance.json`.

This artifact is staging evidence only; it is not printer/RIP qualification evidence.

For PDF/X-4 Production promotion, see `docs/PRODUCTION_PROMOTION_POLICY.md`.


## PDF/X Promotion Evidence Registry

Migration `0009_pdfx_promotion_evidence.sql` adds controlled evidence for:

- `SECONDARY_VALIDATION` — approved PitStop report bound to the exact Candidate artifact SHA-256;
- `RIP_QUALIFICATION` — Ghent PDF Output Suite 5.0 Level 1+2 evidence from the actual production workflow;
- `PRODUCTION_TRIAL` — a real Carton Artwork Studio Candidate processed end-to-end with `noPdfRepair=true`.

Evidence bytes are stored in private R2 and their SHA-256 is calculated by the Worker. Upload creates a DRAFT; submission and approval use the same four-eyes rule as other production controls. Approval re-downloads the R2 object and verifies the registered hash again.

System Readiness contains a separate `PDFX_PROMOTION_EVIDENCE` production gate. It does not affect `STAGING_READY`; it prevents `PRODUCTION_READY` until the complete qualification package passes.

The staging workflow installs `CLOUDFLARE_PDFX_VALIDATOR_TOKEN` into the Worker as the `PDFX_VALIDATOR_TOKEN` secret after deploy and before post-deploy smoke.


## Staging KV artifact store

To avoid requiring R2 billing activation during engineering staging, the staging Worker may bind:

```text
ARTWORK_KV → Workers KV namespace
```

The Worker wraps KV behind the same Artifact Store operations used by the existing code:

```text
put / get / head / delete
```

Current staging namespace:

```text
carton-artwork-studio-staging-artifacts
```

KV is **staging-only**. System Readiness includes a separate Production gate requiring `artifactStoreKind === "R2"`.

The KV compatibility layer enforces a 24 MiB value ceiling, below the Workers KV 25 MiB platform maximum.
