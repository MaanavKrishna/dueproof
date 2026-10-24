# Security

See also [SECURITY.md](../SECURITY.md) for reporting vulnerabilities.

**Built in:** sign-in with scrypt-hashed passwords and hashed session tokens;
CSRF protection by required header; a brute-force brake on sign-in; a strict
Content-Security-Policy (no inline script, no third-party origins, no framing),
`nosniff`, `no-referrer`; uploads accepted by content, not name; resource caps
on size, pages and pixels; path-traversal-safe page serving; CSV formula
injection defused; document text escaped everywhere it is shown; translation
with no network access; an append-only audit trail of sign-ins, uploads, views,
proof-panel opens, searches, edits and exports.

**Your job:** HTTPS (a proxy in front); keeping the port off the internet;
backups; patching the OS, Python and Tesseract.

**Not yet:** per-document access control (everyone signed in sees everything);
malware scanning of uploads; encryption at rest beyond what your disk provides;
two-factor sign-in (use your identity provider via `proxy` mode for that).
