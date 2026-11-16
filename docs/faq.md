# FAQ

**Does any document leave my server?**
Not on a self-hosted server with AI off. The engine that opens your files
has no network route out, translation runs on your server, and Dueproof
sends no telemetry. **Settings → System → Network** lists every host the
install connects to. If you turn AI on with your own key or the Dueproof AI
plan, the parts of a notice the rules weren't sure of go to that provider.

**Does it use ChatGPT or another AI model?**
Not unless you turn it on. Rules read every notice, and they are lists of
words you can read and change. AI is off by default; an owner or admin can
choose a local model, your own key (Anthropic, OpenAI and others) or, on
hosted, the Dueproof AI plan (Claude). AI never sets a date: it returns a
rule, and Dueproof works out the date.

**How do I know a deadline is right?**
Click it. The page opens with the sentence outlined, and the deadline says
how its date was worked out. Anything Dueproof isn't sure of waits in
**Needs review** until a person confirms it. Measure it on your own
documents with the [evaluation tool](evaluation.md).

**Can it read handwriting?** No.

**Does it need a GPU?** No.

**Can it read notices in Hindi, Tamil and other Indian languages?**
Yes, from PDFs with a text layer; with offline translation set up, the rules
read them too. Scanned Indian-language notices are a known gap in v0.1. See
[Languages](languages.md).

**Does it file replies or pay anything?** No. It proposes; a person decides.

**What does it cost?**
Self-hosted is free, with no limits on what reads, proves and tracks
notices. Single sign-on, audit export and white-label reports need a
Business licence. The hosted service is paid.

**What licence is it under?**
FSL-1.1-ALv2 (see `LICENSE`), except `ee/`, which is under a commercial
licence.

**Why "Dueproof"?** Every due date, with proof.
