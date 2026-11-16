# Roadmap

v0.1 is out as a beta: hosted at <https://dueproof-app.vercel.app>, or
self-hosted with Docker. This page says what comes next, in order, and why.
What v0.1 contains is in the [changelog](CHANGELOG.md).

## Free and paid

Self-hosted Dueproof is free. Everything one organisation needs to read its
own notices and trust the result is in the free edition, always: reading, OCR,
every language, rules, proof, deadlines, workflow, reminders, search, export,
backups and evaluation. Nothing that decides whether a finding is *correct* or
*provable* is ever held back.

The paid **Business** features (`ee/`) are the ones larger firms pay to avoid
building: SAML single sign-on, audit export and white-label reports today;
SCIM, SIEM streaming and high availability later. The hosted edition has plans
with or without AI, and every plan can use its own AI key.

## Before v0.1 leaves beta

1. **A chartered accountant signs off the statutory data.** Every period and
   rate is marked "verify" until then.
2. **Accuracy on real notices.** A labelled set of real GST, income-tax and TDS
   notices, with precision, recall and deadline accuracy published per type
   and language, plus the live AI evaluation on the hosted plan.
3. **An independent security test (VAPT)** of the hosted edition.
4. **Email out of the box on hosted:** invitations, password resets and the
   morning digest.
5. **Desktop builds for Windows and macOS,** signed, beside the Linux build.
6. **Pages the fast engine can't read** go to the heavy engine (Tesseract and
   offline translation) on hosted.

## 0.2 — less copying and pasting

7. **Browser extension for government portals** (GST, income-tax
   e-Proceedings, TRACES, MCA). It captures notices from pages you open while
   you are logged in. It never stores portal passwords and never logs in for
   you.
8. **Client document requests:** a checklist per notice type, sent to the
   client with an upload link; what they upload attaches to the case.
9. **Similar notices and a precedent library:** past replies and outcomes by
   notice type and section, and reply templates (ASMT-10, DRC-01, 143(2), 148A
   and others).
10. **A plain-language explanation for the client,** in their language, with
    the same proof on the page.
11. **Corrections suggest new rules:** when people keep making the same
    correction, Dueproof proposes a rule; a person accepts it.
12. **Language hints per client,** not only per organisation.
13. **Ask:** questions about your notices, answered only from quotes Dueproof
    can show on the page.

## Later

- **Native phone apps** (iOS, Android) with a document scanner and a
  home-screen widget. Until then, Dueproof installs as a web app on phones.
- **Desktop Local mode:** the whole of Dueproof on one computer, no server.
- **Email in and WhatsApp in:** forward a notice to your organisation's own
  address or number, and it is read like an upload.
- **Interface languages** other than English.
- **A second hosted region,** and data held in India once our providers offer
  it.
- **Handwriting,** through a review queue where a person types the few fields
  that matter.

## What we will not do

- **Act on our own.** No auto-filed replies and no payments. Dueproof proposes;
  a person decides.
- **Log in to government portals for you,** or store portal passwords.
- **Let a model write a date.** Dates are computed from the notice's words by
  rules a person can read.
- **Show a finding we can't prove.** If a passage can't be found on the page,
  Dueproof says so and a person confirms it.
- **Rewrite a translation to "fix" it.** We flag it and show the original.
- **Collect usage data from self-hosted installs.**
