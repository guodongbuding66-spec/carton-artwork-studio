# PDF/X-4 Candidate Renderer

v1.8 adds a controlled **ICC OutputIntent + PDF/X-4 metadata candidate** path.

This is a technical preparation stage, not a PDF/X conformance claim.

## What is implemented

For an approved CMYK `ICC_PROFILE` asset, the server can generate a validation PDF containing:

- embedded approved TrueType font;
- embedded ICC profile stream;
- `/OutputIntents`;
- `/S /GTS_PDFX`;
- `/DestOutputProfile`;
- `/TrimBox` and `/BleedBox`;
- PDF 1.6 header;
- XMP packet with `pdfxid:GTS_PDFXVersion = PDF/X-4`;
- vector Code 128 and QR;
- proof watermark for the validation path.

The validation PDF is generated only on the Worker after re-reading and SHA-256 verifying both the approved font and approved ICC asset from private R2.

## Why Production is still blocked

The renderer capability currently reports:

```text
fontEmbedding=true
iccOutputIntent=true
pdfxMetadataCandidate=true
pdfxProfiles=[]
```

`pdfxProfiles=[]` is intentional.

Embedding an ICC profile and PDF/X identification metadata is not sufficient evidence of full ISO PDF/X-4 conformance. Production Readiness therefore continues to reject `PDFX_POLICY.profile = PDF/X-4` until an external validator path is integrated and its results are persisted.

## Validation workflow

Quality > Assets:

1. approve a TrueType FONT asset;
2. approve a CMYK ICC_PROFILE asset;
3. approve a FONT_POLICY that pins the exact font code/version;
4. open a real D1 Artwork;
5. click **OutputIntent Test PDF** on the approved ICC asset.

The Worker:

```text
Artwork Canonical Snapshot
 + pinned approved FONT
 + selected approved ICC
        ↓
R2 SHA-256 re-verification
        ↓
Vector server renderer
        ↓
PDF 1.6 + OutputIntent + XMP PDF/X-4 candidate
        ↓
Proof PDF download
        ↓
Audit Log
```

## Not yet claimed

The following are still open before `pdfxProfiles:["PDF/X-4"]` can be enabled:

- independent PDF/X-4 validation;
- validator report persistence;
- page-box/profile checks against the selected printer requirement;
- final color-space restrictions;
- transparency/object conformance checks where applicable;
- external preflight regression fixtures;
- production evidence pinning validator name/version/result.

The system must not infer conformance merely because Adobe Acrobat or another viewer opens the file successfully.
