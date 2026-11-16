# AGENTS.md — how to work in this repository

Dueproof reads tax, regulatory and court notices, finds what's owed and by
when, and proves every finding on the page it came from. The plan is in
`planning/v0.1-plan.md` (read it, and the document for your area, before
starting). This file is the house rules for humans and AI agents alike.

## Layout

```
apps/app            Product — Next.js (App Router, Turbopack)
apps/site           Website + docs — Next.js
apps/desktop        Tauri 2 desktop shell (Windows, macOS, Linux)
services/engine     Python engine (stateless HTTP): read, OCR, translate, rules, proof
packages/contracts  Zod schemas: domain vocabulary, DateRule, engine API  ← CONTRACTS
packages/db         Drizzle schema, migrations, RLS                       ← CONTRACTS
packages/core       Pure domain: date engine, statutory calendar, interest, reconciliation, policy
packages/tokens     Design tokens → CSS variables, TS, Motion presets
packages/ui         Ledger components + Storybook
packages/icons      Icon components
packages/ai         Provider adapters, model routing, prompts, proof gate
packages/auth       Better Auth configuration
packages/storage    Storage port: local disk, R2 (S3 API), Vercel Blob
packages/engine-client  Typed client for services/engine
packages/i18n       Messages and locale formatting
```

## Commands

- `pnpm install` · `pnpm dev` · `pnpm typecheck` · `pnpm test` · `pnpm lint`
- Engine: `cd services/engine && uv run python -m unittest discover -s tests -t . -v`

## Rules

1. **Contracts are frozen.** Don't change `packages/contracts` or
   `packages/db/src/schema.ts` in a feature change. If you need a change, make
   it a separate, minimal commit titled `contract: …` and say why.
2. **Dates are computed, never generated.** Only `packages/core`'s date engine
   turns a `DateRule` into a date. No model output is ever a date.
3. **The page is the proof.** A finding without a located quote is
   `unlocated` and can't become a deadline until a person confirms it.
4. **Every server action and route handler starts with `authorize(…)`**
   from the policy module, and every query runs in an org-scoped
   transaction. Never export a raw DB handle.
5. **Never log document text, keys or tokens.**
6. **UI uses only `@dueproof/ui`** — never Radix or Motion directly (Motion
   through `@dueproof/ui/motion` presets). No raw colours or pixel values
   outside `packages/tokens`.
7. **`packages/core` has no I/O and no framework imports.** Pure functions,
   tested from fixtures.
8. **Features don't import each other.** Shared code moves to a package.
9. **Tests come with the change.** Don't skip, disable or loosen a test to get
   green.
10. **Statutory periods and rates are data with a source**, never code
    constants, and every value is marked "verify" until a CA signs it off.
11. British spelling in user-facing text ("organisation", "licence" as a
    noun). Plain, short sentences.
12. `ee/` is under a commercial licence; code outside `ee/` never imports it.

## Licence

FSL-1.1-ALv2 (see `LICENSE`). Third-party notices in `NOTICE`.
