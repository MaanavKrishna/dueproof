**What this changes and why**

**Checks**

- [ ] `pnpm typecheck`, `pnpm test` and `pnpm lint` pass
- [ ] Engine tests pass, if `services/engine` changed
      (`cd services/engine && uv run python -m unittest discover -s tests -t .`)
- [ ] A fix comes with the test that would have caught it; no test is
      skipped, disabled or loosened
- [ ] No change to `packages/contracts` or `packages/db/src/schema.ts`, or
      it is a separate `contract: …` commit that says why
- [ ] If `services/engine/tests/golden.json` changed, each changed finding
      is explained below
- [ ] No real notices or client data, and nothing logs document text, keys
      or tokens
- [ ] Commits carry no AI attribution trailers (`Co-Authored-By` lines for
      AI tools, session links and the like)
