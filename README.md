# Dueproof

**Every due date in your documents, with proof from the page.**

Dueproof reads the notices, circulars and orders that land on your desk — in
English and 22 Indian languages, typed or photographed — and turns them into a
deadline register. Every deadline, duty and amount it finds is outlined on the
page it came from, so anyone can check it in a second.

It runs on your own machine. No cloud, no API keys, no language model.

![A GST notice in Dueproof: reference, issuing office, amount demanded, the reply deadline counted from receipt, and the hearing date outlined on the page](docs/images/notice.png)

## What it does

- **Finds what you owe and by when** — duties, deadlines (including "within 30
  days of receipt", counted from the day *you* received it), hearings, amounts
  demanded, references and the provisions cited.
- **Shows its work** — every finding is outlined on the source page. If a
  passage cannot be located, Dueproof says so instead of guessing.
- **Reads Indian languages** — Hindi, Bengali, Tamil, Telugu, Marathi, Urdu and
  the rest of the 22 scheduled languages, translated locally so the same rules
  read them. The original wording is always the proof.
- **Runs the work** — assign an owner, correct a date or desk, mark it done;
  every change is kept. A weekly digest tells each person what is due.
- **Reads phone photos** — skewed, noisy scans and WhatsApp-forwarded JPEGs go
  through OCR with the highlights still landing on the right words.
- **Fits your organisation** — a profile (plain lists of words) sets your
  desks, document types and phrasing. The default is built for Indian tax,
  corporate, labour, regulatory and court notices.

## Try it in five minutes

```bash
git clone https://github.com/MaanavKrishna/dueproof && cd dueproof
```

```bash
python3 -m venv .venv && .venv/bin/pip install -e .
```

```bash
.venv/bin/dueproof users add you@example.org --admin
```

```bash
.venv/bin/dueproof serve
```

Open <http://127.0.0.1:8000>, sign in, and drop in a PDF or a photo of a
notice. You need Python 3.12+ and [Tesseract](https://tesseract-ocr.github.io/)
(`brew install tesseract tesseract-lang`, or `apt install tesseract-ocr tesseract-ocr-hin`).

Check the installation any time with `dueproof doctor`.

## Documentation

| | |
|---|---|
| [Install](docs/install.md) | Python, Docker, Tesseract, translation weights |
| [Quickstart](docs/quickstart.md) | First notice, first deadline, first digest |
| [Notices](docs/notices.md) | What Dueproof extracts from a notice, and how |
| [Workflow and reminders](docs/workflow-and-reminders.md) | Owners, corrections, history, the digest |
| [Languages](docs/languages.md) | The 22 languages, OCR packs, translation |
| [Profiles](docs/profiles.md) | Making it fit your organisation |
| [Accounts and SSO](docs/accounts-and-sso.md) | Built-in sign-in, or your identity provider |
| [Deployment](docs/deployment.md) | systemd, Docker, HTTPS, backups |
| [Evaluation](docs/evaluation.md) | Measuring accuracy on your own documents |
| [Configuration](docs/configuration.md) | Every setting |
| [Architecture](docs/architecture.md) | How it is built, and where each part lives |
| [API](docs/api.md), [Security](docs/security.md), [FAQ](docs/faq.md) | |

## Status

Version 0.1 — early. It works end to end and is tested (265 tests, an
accuracy gate in CI), but it has been measured only on a small, fictional
corpus. Before you rely on it for real deadlines, run it alongside your current
process and measure it on your own documents with `dueproof eval`.

See [ROADMAP.md](ROADMAP.md) for what comes next.

## Licence

[Apache 2.0](LICENSE). Third-party components are listed in [NOTICE](NOTICE).
Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).
