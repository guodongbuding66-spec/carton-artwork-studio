# Production Asset Registry

Production assets are controlled files that can affect print output.

Current asset types:

- `FONT` — TTF / OTF / SFNT font files supplied under an approved license/source
- `ICC_PROFILE` — ICC/ICM output profiles supplied by the printer, customer or approved color-management source

The registry is intentionally separate from normal Content Master data.

## Security and lifecycle

Raw files are stored in the private `ARTWORK_FILES` R2 bucket.

The web UI exposes metadata and approval state but does **not** expose a download button for raw Font / ICC files.

Lifecycle:

```text
Upload
  ↓
DRAFT
  ↓ Admin submit
SUBMITTED
  ↓ different Template Approver / Admin identity
APPROVED / REJECTED
  ↓
new approved version retires the previous approved version of the same type + code
```

The submitter cannot approve or reject the same asset.

## Upload validation

### Font

The Worker performs structural SFNT validation before writing the registry record:

- TrueType / OpenType / supported SFNT signature
- table count sanity
- table directory bounds
- printable table tags
- duplicate table-tag rejection
- every table offset / length must remain inside the uploaded bytes

This is a structural integrity check. It does **not** certify font licensing or prove that every glyph needed by a template exists.

### ICC profile

The Worker validates:

- minimum ICC header + tag-count size
- declared profile size
- `acsp` signature
- version
- device/profile class
- data color space
- PCS
- tag count and tag-table bounds

This is not a full ICC conformance test.

## Provenance requirement

Before an asset can move from DRAFT / REJECTED to SUBMITTED, `License / source note` must be present.

Examples:

- licensed commercial font from vendor X
- OFL font, upstream repository / release
- printer-provided ISO Coated profile
- customer-provided output profile

The system records the note as metadata but does not infer legal rights from it.

## Approval-time integrity

Approval does not trust the original upload event alone.

Before APPROVE, the Worker:

1. reads the R2 object again;
2. recomputes SHA-256;
3. compares SHA-256 with the immutable registry value;
4. reruns Font / ICC structural inspection;
5. blocks approval on mismatch or validation failure.

A hash mismatch is also written as a Security Event.

## Relationship to Production Readiness

An approved Font asset and an approved ICC asset are now explicit Production Readiness gates.

However, **approved assets do not automatically enable renderer capability**.

At v1.6 the renderer still reports:

- font embedding = not implemented
- font outlining = not implemented
- PDF/X profiles = none implemented

Therefore Production Export remains correctly blocked until renderer integration is implemented and tested.

This distinction is deliberate:

```text
approved file ≠ implemented renderer capability
```

## Next integration work

Future renderer integration must pin exact approved asset identities into the production evidence:

- asset type
- code
- version
- SHA-256
- approver
- approval timestamp

The renderer must never select “latest file by filename” or silently fall back to a system font/profile.
