# Contributing to Dueproof

Thank you for looking. The most useful contributions, roughly in order:

1. **A profile for your kind of organisation** — a hospital, a court registry, a
   bank branch, a university. A profile is plain lists in `profiles/`; no
   pipeline code changes. Copy `general.py`.
2. **Depth for a language** — month names, how duties and deadlines are worded,
   a repair module in `pipeline/scripts/` if text extraction damages the
   script. `metro_rail_ml.py` and `pipeline/scripts/malayalam.py` are the models.
   Please only contribute vocabulary for a language you read.
3. **A document that Dueproof gets wrong** — as a test, not as a file. Never
   attach real documents to an issue; reduce the problem to a few invented
   sentences that reproduce it.
4. Bug fixes and the items in `ROADMAP.md`.

## Setting up

```bash
python3 -m venv .venv
```

```bash
.venv/bin/pip install -r requirements.txt -r requirements-dev.txt
```

You also need Tesseract with the Malayalam pack (the suite exercises a bilingual
profile): `brew install tesseract tesseract-lang` or
`apt install tesseract-ocr tesseract-ocr-mal`.

## Before you open a pull request

```bash
./test.sh
```

```bash
.venv/bin/python -m pyflakes *.py pipeline profiles scripts tests
```

- **The golden file is a contract.** `tests/golden.json` pins every finding on
  the fixture corpus. If your change moves one, run
  `python -m tests.make_golden`, read the diff, and say in the pull request why
  each change is an improvement.
- **A fix comes with the test that would have caught it.**
- **No new dependencies** without discussion. The deployment story is a folder
  and a Python process; every dependency is something an operator must audit.
- **Nothing may reach the network at run time.** `tests/test_translate.py`
  enforces this.

## Principles a change should not break

- Every finding carries a verbatim quote and is located on the page, or is
  shown as *not located*. Never a guessed rectangle.
- Rules stay explainable: for any finding, someone can say which words caused it.
- A translation is labelled as one, and never replaces the original as proof.
- Flag doubt; do not paper over it.

## Licence of contributions

By contributing you agree that your contribution is licensed under the
Apache License 2.0, as in section 5 of the licence.
