# Roadmap

What comes after 0.1, in order. Each item says why it matters.

## The line between open and commercial

Dueproof is open core. Everything needed for one organisation to read its own
documents and trust the result is open, always: the pipeline, all languages,
profiles, workflow, reminders, search, export, audit, backups, evaluation.
Nothing that affects whether a finding is *correct* or *provable* is ever held
back. Commercial offerings will be what larger deployments pay to avoid
building: managed hosting, connectors to proprietary systems,
directory-synced access control, support with a response time.

## 0.2 — measured on real documents

1. **Real accuracy numbers.** A labelled set of a few hundred notices per major
   type and language, built from public regulator circulars (each source's reuse
   terms checked), donated documents (with consent and redaction) and in-app
   corrections. Publish precision, recall, deadline accuracy and the
   false-confident rate per document type and language.
2. **Test the remaining sixteen languages** end to end with the real model.
3. **Mail inbox connector** (IMAP): notices arrive by email; read them there.
4. **Per-document access control**, enforced in the queue, card, deadline
   line, search and export alike.
5. **Published container image**, built and tested in CI.

## 0.3 — fits into the day

6. **Portal downloads** — a watched folder per portal export (GST, income tax,
   MCA), with the channel set automatically.
7. **Calendar feed** (iCal) of open deadlines per person.
8. **DOCX, emails and images inside them.**
9. **Interface in the reader's language.**
10. **Phone layout** for checking a deadline on the move.

## Later, and only with evidence

- **A local model beside the rules**, never instead of them: it may suggest
  sentences the rules missed, shown as suggestions until a person accepts them.
- **Handwriting**, through a review queue where a person transcribes the few
  fields that matter.
- **Linking documents** — a notice, its reply, the order that closes it.

## What we will not do

- **Send documents to a cloud service.** Running on your own machine is the point.
- **Act on our own.** No auto-filed replies, no auto-payments. Dueproof proposes;
  a person decides.
- **Replace the rules with a model.** Being able to say why a sentence was
  flagged is the product.
- **Rewrite a translation to "fix" it.** Flag it and show the original.
- **Guess a rectangle.** If the passage cannot be located, say so.
