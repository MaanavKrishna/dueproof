# Dueproof website

The project website (`@dueproof/site`): Next.js and TypeScript, exported as
static files. It describes v0.1; the product itself lives in `apps/app`.

```bash
pnpm install
pnpm --filter @dueproof/site dev     # http://localhost:8090
pnpm --filter @dueproof/site build   # static site in apps/site/out
```

The documentation pages are rendered at build time from the Markdown in
`../../docs`, and its images are copied in, so edit the docs there.

## Design

Built on Ledger: colours, type, spacing, radii, shadows and motion come from
`@dueproof/tokens` (`--dp-*`, brand `ink-saffron`), components from
`@dueproof/ui`, icons from `@dueproof/icons`. `app/globals.css` adds only the
editorial layer: display type, page bands and the home page story. The proof
colour (saffron) is used for evidence only.

- **Fonts** are self-hosted from `@fontsource` (Inter, and Noto per Indian
  script with `unicode-range`, so a script downloads only when shown). No
  calls to Google Fonts.
- **Motion:** the home page story (`components/ScrollStory.tsx`) is
  scroll-linked with `useScroll` / `useTransform`. With reduced motion it is
  replaced, in CSS, by four still frames of the same scene. Components and
  presets come from `@dueproof/ui/motion`; the scroll hooks are re-exported in
  `lib/motion.ts` until the UI package exports them.
- **CSS targets** are modern (`browserslist` in `package.json`) so the
  tokens' `light-dark()` isn't lowered.
- **No cookies, no analytics, no third-party requests.**

The sample notice (`lib/sample.ts`) is fictional.

## Deploying

**GitHub Pages:** a project site is served under `/<repo>/`, so build with
`PAGES_BASE_PATH=/dueproof pnpm --filter @dueproof/site build` and publish
`apps/site/out`.

**Vercel:** create a project with Root Directory `apps/site` and the Next.js
framework preset; Vercel installs the pnpm workspace from the repository root
and serves the static export. Leave `PAGES_BASE_PATH` unset. No environment
variables are needed.
