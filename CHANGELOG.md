# Changelog

## 0.1.0 — unreleased

First public version.

- Read PDFs by text layer or OCR; deskew scans and map boxes back to the page.
- Rule-based title, type, summary, obligations, deadlines and desk routing,
  driven by a profile.
- Every finding located on the page as per-line rectangles, with an honest
  confidence band.
- 22 Indian languages beside English, via local translation before analysis.
- Duplicate detection across channels with MinHash candidate selection.
- Full-text search with provable hits; CSV and evidence-PDF export.
- Idempotent ingest by content hash, restart recovery, resource caps, audit
  trail, backup and verified restore.
