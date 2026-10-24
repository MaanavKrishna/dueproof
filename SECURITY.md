# Security

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private vulnerability reporting
on this repository (Security tab, "Report a vulnerability"). You should get an
acknowledgement within a few days.

## What Dueproof does and does not protect against

Dueproof is built to run inside an organisation's own network.

It does:
- refuse path traversal on page images, non-PDF uploads, oversized uploads and
  PDFs beyond the page limit;
- defuse spreadsheet formulas in exported CSVs and escape document text in the
  interface and the exported PDF;
- run translation with vendored model code and hash-pinned weights, with no
  network access at run time;
- keep an append-only audit trail.

It does not, by itself:
- authenticate users or restrict who sees which document. Run it behind a
  reverse proxy that does (see README, "Running behind single sign-on");
- encrypt traffic. Terminate TLS at the proxy;
- scan uploads for malware;
- protect against a malicious PDF exploiting the PDF or OCR libraries beyond
  the resource caps. Keep dependencies patched.

Do not expose a bare Dueproof port to the internet.
