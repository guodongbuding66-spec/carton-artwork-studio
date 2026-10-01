# PDF/X-4 Production Promotion & Trusted Validator Policy

Version: **2.0.0**

This policy defines the evidence required before Carton Artwork Studio may promote `PDF/X-4` from a renderer **Candidate Capability** to an official **Production Capability**.

The core rule is fail-closed:

```text
Candidate renderer exists
        ≠
PDF/X-4 production capability
```

`pdfxProfiles` must remain empty until the complete promotion package below is approved.

## 1. Normative target

Production promotion targets:

- Profile: `PDF/X-4`
- Standard: `ISO 15930-7:2010`
- PDF base version: PDF 1.6
- Industry baseline: GWG 2022
- Application ruleset: `CAS-PDFX4-PRODUCTION-1@1.0.0`
- Ruleset canonical SHA-256:
  `f658882bd2d367839ea2fb3b3bce027320de4a70d480169feb3ba860588a6d80`

Canonical machine-readable ruleset:

`config/pdfx/CAS-PDFX4-PRODUCTION-1.json`

The ISO page states that ISO 15930-7:2010 remains the current PDF/X-4 edition after its 2026 review:

https://www.iso.org/standard/55843.html

GWG 2022 application/preflight settings:

https://gwg.org/application-settings/

## 2. Trusted primary validator

The automated production validator is pinned to:

```text
Product: callas pdfToolbox CLI OR callas pdfToolbox Server
Version: 17.0.683
Profile: PDF/X-4
Ruleset: CAS-PDFX4-PRODUCTION-1
Ruleset version: 1.0.0
Ruleset SHA-256: f658882bd2d367839ea2fb3b3bce027320de4a70d480169feb3ba860588a6d80
```

A newer or older pdfToolbox build is **not automatically trusted**. It requires an explicit policy update, CI review, and requalification.

The version pin is intentional: a validator upgrade can change parsing, preflight rules, or edge-case interpretation and must not silently change production acceptance.

Current pdfToolbox version history:

https://oem.callassoftware.com/pdftoolbox-version-history/

### Bridge acceptance

For a primary result to be considered trusted, the validator response must echo:

- exact PDF SHA-256;
- `PDF/X-4`;
- exact trusted validator product name;
- exact version;
- exact ruleset ID;
- exact ruleset version;
- exact ruleset SHA-256;
- `PASS`;
- no failed check in `checks[]`.

Transport or schema success alone is not enough.

## 3. Independent secondary validator

A production promotion package must also include independent corroboration from:

```text
Product: Enfocus PitStop Pro
Version: 26.07
Profile: PDF/X-4
Result: PASS
```

PitStop is intentionally a different validation engine from the primary validator.

Current PitStop release information:

https://www.enfocus.com/en/support/release-notes/pitstop-pro-release-notes

A secondary tool is evidence, not the runtime production bridge. The runtime bridge remains pinned to the primary validator.

## 4. Regression corpus required for promotion

At least **5 unique Candidate PDF byte streams** are required.

Each artifact must have a unique SHA-256 and represent a deliberately different production risk:

1. standard US Side Seal reference artwork;
2. maximum supported text / field-length boundary;
3. Code 128-B and QR payload boundary case;
4. production font glyph-coverage boundary;
5. page-box / geometry / OutputIntent boundary case.

For every one of the five exact byte streams:

- primary validator must PASS;
- secondary validator must PASS;
- SHA-256 must be the same across both validator evidence sets;
- internal structural checks must PASS;
- no manual PDF repair is allowed between the two validations.

If any validator rewrites/fixes the PDF before testing, that result does not qualify.

## 5. Application-specific production rules

`CAS-PDFX4-PRODUCTION-1` is stricter than merely writing a PDF/X metadata flag.

The current ruleset requires:

- strict PDF/X-4 conformance;
- OutputIntent present and pinned to the approved CMYK ICC asset;
- production output profile is CMYK;
- production fonts are fully embedded;
- no silent font substitution;
- production marks remain K-only under the current product policy;
- TrimBox and BleedBox are present and coherent;
- no annotations, forms, JavaScript, or embedded files in Production PDF;
- Code 128-B and QR remain vector;
- every validation result is bound to the exact artifact SHA-256.

Changing any of these requirements creates a new ruleset version.

## 6. Real print-house / RIP qualification

Validator PASS is necessary but not sufficient.

Before PDF/X-4 can enter `pdfxProfiles`, the **actual production print workflow** must pass:

```text
Ghent PDF Output Suite 5.0
Conformance: Level 1+2
Pages: 1-6
Result: PASS
```

Level 1+2 is required because it includes ICC-based color-management tests, not only the CMYK/spot subset.

References:

https://gwg.org/gos5/
https://gwg.org/gos5/conformance-certification/

The evidence must identify:

- print service provider / factory;
- RIP or DFE product;
- exact RIP/DFE version;
- output device / press / proof device;
- relevant processing settings;
- test timestamp;
- explicit PASS result;
- report/photo/evidence file SHA-256;
- confirmation that the test used the same production workflow that will process Carton Artwork Studio files.

A generic vendor claim that a RIP family is compatible is not enough. Evidence must come from the actual configured production workflow.

In addition to the Ghent Output Suite, at least one real Carton Artwork Studio PDF/X-4 Candidate must be processed end-to-end through that workflow without repair.

## 7. Evidence freshness and invalidation

Printer/RIP qualification expires after **365 days**.

Requalification is also mandatory when any of the following changes:

- primary validator product or version;
- application ruleset ID/version/SHA;
- production renderer behavior affecting PDF bytes;
- approved production font or font mode;
- approved ICC profile / Output Condition;
- RIP/DFE product or version;
- RIP/DFE PDF processing settings;
- output workflow changes that can affect interpretation of transparency, overprint, color management, fonts, or page boxes.

## 8. Controlled evidence registry

Promotion qualification evidence is stored as controlled R2 + D1 records rather than free-form notes.

Evidence types:

- `SECONDARY_VALIDATION`
- `RIP_QUALIFICATION`
- `PRODUCTION_TRIAL`

Lifecycle:

```text
Upload bytes
   ↓ Worker SHA-256
DRAFT
   ↓ submit
SUBMITTED
   ↓ different reviewer
APPROVED / REJECTED
```

The submitter cannot approve their own evidence. Approval re-reads the private R2 object, recomputes the evidence SHA-256, and revalidates policy metadata.

The Production Trial must reference an artifact SHA-256 that is part of the same-byte regression set which passed both the trusted primary validator and the approved secondary validator. It must also assert `actualProductionWorkflow=true` and `noPdfRepair=true`.

System Readiness consumes only **APPROVED** evidence.

## 9. Promotion decision

Only after all evidence above exists and has been reviewed may a separate code-reviewed promotion change set:

```js
pdfxProfiles = ["PDF/X-4"]
```

That promotion must be explicit and reviewable. It must not be driven merely by:

- a configured validator URL;
- one successful Candidate;
- a user-editable policy row;
- a single vendor compatibility statement;
- a PASS result that does not identify validator version/ruleset;
- a print-house verbal confirmation.

Until then:

```text
pdfxCandidateProfiles = ["PDF/X-4"]
pdfxProfiles = []
Production Export = BLOCKED
```

## 10. Cloudflare staging final acceptance

v2.0 staging is eligible for final acceptance only when:

- CI is green;
- staging deploy is serialized;
- D1 migration state is current;
- D1, R2, and Assets bindings are live;
- Cloudflare Access is enforced;
- `AUTH_BYPASS=0`;
- bootstrap admin override is removed;
- R2 deep probe has passed within 24 hours;
- at least two independent identities can perform four-eyes approval;
- approved Template, Factory, FONT, and ICC assets exist as required by the current readiness gates;
- `PDFX_VALIDATOR_URL` is configured;
- `PDFX_VALIDATOR_TOKEN` is installed as a Worker secret;
- `/api/health` reports v2.0.0 and promotion policy v2.0.0;
- post-deploy smoke produces `staging-acceptance.json`;
- at least one externally validated Candidate returns a **trusted** primary validator result.

Staging acceptance does **not** promote PDF/X-4 to Production. Printer/RIP qualification remains a separate production capability gate.
