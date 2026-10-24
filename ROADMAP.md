# Roadmap

Where Dueproof is going, in the order we would do it. Each item says why it
matters and how we would know it worked.

## The line between open and commercial

Dueproof is open core. The rule for what goes where:

- **Open, always:** everything needed for one organisation to read its own
  documents and trust the result — the pipeline, all languages, profiles,
  search, export, the audit trail, backups. Nothing that affects whether a
  finding is *correct* or *provable* is ever held back.
- **Commercial, later:** what a large deployment pays for because it saves
  them integration work — managed hosting, connectors to proprietary systems,
  directory-synced access control, support with a response time.

## Now — before a 1.0

1. **Replace PyMuPDF.** It is AGPL-3.0, which binds anyone hosting Dueproof
   and blocks closed add-ons. It does four jobs here: rendering pages, reading
   the text layer with word boxes, laying out the evidence PDF, and building
   test fixtures. Candidates: pypdfium2 (Apache/BSD) for rendering and text,
   a permissive layout library for the report. *Done when:* PyMuPDF is out of
   `requirements.txt` and the golden file is unchanged or every change is
   explained.
2. **A labelled evaluation set, and published numbers.** Today extraction
   quality is demonstrated, not measured. A few hundred sentences per language,
   labelled obligation / deadline / desk, invented or donated with permission.
   Report precision and recall separately, deadline exact-match accuracy, and —
   the number that matters most — the false-confident rate: findings marked
   `exact` or `strong` whose rectangles are wrong.
3. **Test the remaining sixteen languages** end to end with the real model, the
   way Hindi, Tamil, Bengali, Urdu, Telugu and Malayalam are tested now.
4. **Correcting a wrong finding.** Editable findings, stored beside the
   original rather than over it. Gives a corrected corpus, a record of what the
   rules got wrong, and labelled data as a by-product of normal use.
5. **Build and publish the container image** from CI; the `Dockerfile` has
   never been built.
6. **Hash-pinned dependencies and an SBOM**, generated in CI.

## Next

7. **Document-level access control.** Who may see which document, enforced in
   the queue, the card, the deadline list, search and export — all five, since
   the deadline list is the easy one to forget.
8. **Connectors.** A mail inbox and a watched network share first: both are
   open protocols. The inbox folder is the seam they plug into.
9. **Alerts.** A weekly digest per desk: what falls due, what is overdue.
10. **More formats.** DOCX, images, email files — converted to pages, then the
    same pipeline.
11. **Interface in the reader's language.** The findings are multilingual; the
    buttons and labels are English only.
12. **Handwriting.** Not by pretending OCR reads it: a review queue where a
    person transcribes the few fields that matter, marked as manual.
13. **A phone-sized layout.**
14. **A durable job queue**, when one node is no longer enough.

## Later, and only with evidence

- **A local model beside the rules**, never instead of them: it may suggest
  sentences the rules rejected, shown as suggestions until a person accepts.
- **Linking documents into chains** — the directive, the circular that assigns
  it, the report that closes it.
- **Fine-tuning translation** on an organisation's own bilingual documents.

## What we will not do

- **Send documents to a cloud service.** Running on your own machine is the
  point, not a preference.
- **Act on our own.** No auto-sent mail, no auto-created tickets. Dueproof
  proposes; a person decides.
- **Replace the rules with a model.** Being able to say why a sentence was
  flagged is the product.
- **Rewrite a translation to "fix" terminology.** Flag it and show the
  original.
- **Guess a rectangle.** If the passage cannot be located, say so.
