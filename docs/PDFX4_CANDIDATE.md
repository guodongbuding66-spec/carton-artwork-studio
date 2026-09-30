# PDF/X-4 Candidate Renderer

## Status

The v1.8 renderer can generate a **PDF/X-4 candidate** for internal engineering validation.

It is deliberately **not** advertised as PDF/X-4 conforming production output yet.

The production capability flag remains:

```text
pdfxProfiles = []
pdfxCandidateProfiles = ["PDF/X-4"]
```

This keeps Production Export blocked until an independent PDF/X validator / print-production acceptance gate is integrated.

## Why this exists

The Ghent Workgroup states that PDF/X files need an output intent describing the intended printing condition, and its current modern print specifications are based on PDF/X-4. GWG material for PDF/X-4 also emphasizes font embedding.

References:

- https://gwg.org/all-about-pdf-x/
- https://gwg.org/pdf-x-output-intents-white-paper/
- https://gwg.org/technical-specifications/
- https://gwg.org/application-settings/

The PDF Association overview is also useful for PDF version semantics:

- https://pdfa.org/pdf-versions/

## Implemented candidate structure

When the renderer receives:

- an approved TrueType FONT asset;
- an approved CMYK ICC_PROFILE asset;
- `pdfxProfile = PDF/X-4`;
- an explicit Output Condition Identifier;

it generates a PDF 1.6 candidate with:

- embedded TrueType `FontFile2`;
- Type0 / CIDFontType2;
- ToUnicode CMap;
- PDF Catalog `/OutputIntents`;
- `/S /GTS_PDFX`;
- embedded ICC `/DestOutputProfile`;
- `/N 4` CMYK profile stream;
- XMP Metadata stream;
- `pdfxid:GTS_PDFXVersion="PDF/X-4"`;
- Document Info `/GTS_PDFXVersion (PDF/X-4)`;
- `/TrimBox`;
- `/BleedBox`;
- no Helvetica production fallback.

## Internal structural check

The renderer runs a narrow structural self-check on candidate bytes.

It checks only that expected PDF/X-related structures are present.

A result such as:

```text
STRUCTURAL_PASS
```

means only that the expected objects / metadata are present.

It does **not** prove ISO 15930 conformance.

## Quality > Assets workflow

With an opened D1 Artwork, a Template Approver / Admin can select:

1. an Approved TrueType Font;
2. an Approved CMYK ICC profile;
3. an Output Condition Identifier;

then run **Render PDF/X-4 Candidate**.

The output:

- is watermarked / proof-mode content;
- is not persisted as an authoritative Production PDF;
- records an Audit event;
- includes Font + ICC SHA-256 evidence in response headers;
- must not be sent to production.

## Production path preparation

The authoritative production renderer is already prepared to consume the exact PDFX_POLICY pins:

```json
{
  "profile": "PDF/X-4",
  "iccAssetCode": "PRINTER_CMYK",
  "iccAssetVersion": "1.0",
  "outputConditionIdentifier": "Printer-approved condition"
}
```

Before PDFX_POLICY can be approved, the pinned ICC asset must:

- be Approved;
- match the exact code + version;
- report CMYK as the ICC data color space.

However, PDFX_POLICY still fails the renderer capability gate because `PDF/X-4` is only a candidate profile at v1.8.

## What still blocks conformance

Before moving PDF/X-4 from candidate to production capability, the project needs:

- an independent PDF/X validator or printer-approved preflight;
- regression fixtures that the external validator accepts;
- agreed page-box policy for the actual carton production workflow;
- agreed output condition identifiers / ICC profiles per printer or market;
- validation of K-only artwork behavior under the selected CMYK OutputIntent;
- production RIP / printer acceptance testing.

Only after those checks should `RENDERER_CAPABILITIES.pdfxProfiles` include `PDF/X-4`.
