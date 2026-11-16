# Contributing to Dueproof

Thank you for looking. The most useful contributions, roughly in order:

1. **A notice Dueproof gets wrong**, reduced to a test. Never attach real
   notices to an issue or pull request: reduce the problem to a few invented
   sentences that reproduce it.
2. **Depth for a language you read:** month names, how duties and deadlines
   are worded, or a repair module in
   `services/engine/dueproof_engine/pipeline/scripts/` if text extraction
   damages the script (`malayalam.py` is the model). See
   [Languages](docs/languages.md).
3. **Notice types and statutory data:** the phrases that identify a notice
   type (`services/engine/dueproof_engine/profiles/notices_in.py`), or a
   statutory period or rate in `packages/core/src/statutory/packs/in/`, with
   its source. See [Notice types](docs/profiles.md).
4. Bug fixes and the items in [ROADMAP.md](ROADMAP.md).

For anything larger than a fix, open an issue first so we can agree on the
shape before you write the code.

## Setting up

You need Node 22+, pnpm 10 and, for the engine, Python 3.12+ with
[uv](https://docs.astral.sh/uv/).

```bash
pnpm install
cp apps/app/.env.example apps/app/.env.local   # set AUTH_SECRET (openssl rand -hex 32)
pnpm dev
```

The app runs at <http://localhost:3000> on embedded Postgres (PGlite) with a
fake engine that answers from the real engine's recordings, so no other
service is needed. To read real documents, run the engine and set
`ENGINE_MODE=http` (see [services/engine/README.md](services/engine/README.md)):

```bash
cd services/engine
uv sync
uv run python scripts/fetch_ocr_models.py
```

The engine's scan and translation tests need Tesseract with the Hindi and
Malayalam packs (`apt install tesseract-ocr tesseract-ocr-hin
tesseract-ocr-mal`, or `brew install tesseract tesseract-lang`). Without it,
those tests skip themselves.

## Where things are

```
apps/app            the product (Next.js App Router)
apps/site           website and docs (Next.js, static export)
apps/desktop        desktop shell (Tauri 2)
services/engine     Python engine: read, OCR, translate, rules, proof
packages/contracts  Zod schemas: domain vocabulary, DateRule, engine API
packages/db         Drizzle schema, migrations, row-level security
packages/core       pure domain: date engine, statutory calendar, interest, policy
packages/ui         Ledger components and Storybook (tokens and icons beside it)
packages/*          ai, auth, storage, engine-client, i18n, plugins
ee/                 Business features, under a commercial licence
evals/              the AI eval harness
infra/              Docker Compose, Vercel and Sandbox setups
docs/               documentation (also rendered on the website)
planning/           the v0.1 plan: the design record
```

[Architecture](docs/architecture.md) has the full map.

## House rules

[AGENTS.md](AGENTS.md) holds the rules for humans and AI agents alike. Read it
before you change anything. The ones contributors meet most:

- **Contracts are frozen.** Don't change `packages/contracts` or
  `packages/db/src/schema.ts` in a feature change. If you need to, make a
  separate, minimal commit titled `contract: …` and say why.
- **Dates are computed, never generated.** Only the date engine in
  `packages/core` turns a rule into a date. No model output is ever a date.
- **The page is the proof.** Every finding carries a verbatim quote located
  on its page, or is marked *unlocated* and waits for a person. Never a
  guessed rectangle.
- **Every server action and route handler starts with `authorize(…)`,** and
  every query runs in an organisation-scoped transaction.
- **Never log document text, keys or tokens.**
- **The UI uses only `@dueproof/ui`,** and no raw colours or pixel values
  outside `packages/tokens`.
- **Statutory periods and rates are data with a source,** marked "verify"
  until a chartered accountant signs them off.
- **Code outside `ee/` never imports it.** Self-hosted Free must build with
  `ee/` deleted; CI checks this.
- British spelling in anything people read ("organisation", "licence" as a
  noun). Plain, short sentences.

## Before you open a pull request

```bash
pnpm lint
pnpm typecheck
pnpm test
cd services/engine && uv run python -m unittest discover -s tests -t . -v
```

As needed:

```bash
pnpm --filter @dueproof/app e2e        # Playwright and axe-core, on a production build
pnpm --filter @dueproof/ai eval        # AI eval, recorded mode
pnpm --filter @dueproof/db db:check    # migrations embedded and up to date
pnpm --filter @dueproof/site build     # the website, with the docs
```

- **Tests come with the change.** A fix comes with the test that would have
  caught it. Don't skip, disable or loosen a test to get green.
- **The engine's golden file is a contract.** `services/engine/tests/golden.json`
  pins every finding on the fixture corpus. If your change moves one, run
  `uv run python -m tests.make_golden` in `services/engine`, read the diff,
  and say in the pull request why each change is an improvement.
- **The AI eval holds:** no confidently wrong outline, ever.
- **No new dependencies** without discussion. Every dependency is something
  a self-hosting operator must audit.
- **The self-hosted engine never reaches the network at run time.**
  `services/engine/tests/test_translate.py` enforces this.

## Docs and the website

The documentation is the Markdown in `docs/`. The website (`apps/site`)
renders it at build time, so a docs change shows up on the site with no
extra work:

```bash
pnpm --filter @dueproof/site dev       # http://localhost:8090
```

The website is at <https://dueproof.vercel.app> and the hosted app at
<https://dueproof-app.vercel.app>.

## Principles a change should not break

- Every finding is proved on its page, or shown as *unlocated*.
- Rules stay explainable: for any finding, someone can say which words caused
  it.
- A translation is labelled as one, and never replaces the original as proof.
- Flag doubt; don't paper over it.

## Licence of contributions

<!-- TODO: lawyer review -->
By contributing you agree that your contribution is licensed under the
project's licence, the Functional Source License 1.1 with the Apache 2.0
future licence (FSL-1.1-ALv2; see [LICENSE](LICENSE)). The `ee/` directory is
under a separate commercial licence ([ee/LICENSE](ee/LICENSE)); contributions
to `ee/` need a separate agreement with the maintainers before they can be
accepted.
