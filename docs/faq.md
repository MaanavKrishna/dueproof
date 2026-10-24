# FAQ

**Does any document leave my machine?**
No. There is no code path that sends document text anywhere. The only network
access in the project is `dueproof fetch-model`, which you run by hand once to
download translation weights.

**Does it use ChatGPT or another LLM?**
No. Extraction is rules you can read and change; translation is a small,
dedicated model (IndicTrans2, about 200 million parameters) running locally.

**How accurate is it?**
Measured on the project's small fictional corpus: every obligation it reports
is real, it finds about three quarters of them, and every due date it reports
is right. On your documents it will differ — measure it with
[`dueproof eval`](evaluation.md). It is built to be wrong visibly: an
unlocatable passage gets no box, and a doubtful translation is flagged.

**Can it read handwriting?** No.

**Does it need a GPU?** No. Translation runs on a CPU; a page takes a second
or two to read and a few seconds to translate.

**What does it cost?** Nothing; it is Apache-2.0 licensed. Hosting, support and
integrations for organisations are planned.

**Why "Dueproof"?** Every due date, with proof.
