# @dueproof/ui

Ledger, Dueproof's design system: the components, page templates and motion
presets every screen is built from (house rule 6). Colours, sizes and spacing
come from `@dueproof/tokens`; nothing here uses a raw colour or pixel value
(`src/guardrails.test.ts` checks).

```bash
pnpm --filter @dueproof/ui storybook   # http://localhost:6006
pnpm --filter @dueproof/ui test
```

## Layout

Every screen's layout follows the same rules, so screens can't drift apart.
See them at several widths in Storybook under **Foundations/Layout**.

### Page widths

A page template takes a `width`: how wide its content may go. The limits
are tokens (`layout.page.*`).

| Width      | Limit  | For                                                    | Default of             |
| ---------- | ------ | ------------------------------------------------------ | ---------------------- |
| `full`     | none   | dashboards, tables, calendars (Today, Inbox, Notices…) | `ListPageTemplate`     |
| `wide`     | 1680   | records and results (a case, a client, Search)         | `DetailPageTemplate`   |
| `readable` | 1120   | forms and reading (Settings: navigation and forms)     | `SettingsPageTemplate` |
| `narrow`   | 640    | one task in one column (Capture)                       | —                      |

Below its limit a page is fluid at every width. Above it, the page centres as
**one column**: the title, banners, filters and content move together, so
they always share a left edge. Nothing is pinned to the left with an empty
half-screen beside it, and nothing floats on its own. On ultra-wide screens
`full` pages use all the space; the others centre.

Every part of a page pads its sides by `--dp-page-inset`: the page gutter,
or more once the page is wider than its width allows. Templates set it; the
toolbar, banners, summaries, filters, list bodies, settings and record bodies
use it. Content inside the body needs no side padding of its own (adding it
is how screens drifted off the header's edge).

### Gutters

`--dp-page-gutter` grows with the screen: 16 on phones (under 640), 24 on
tablets and laptops, 32 from 1440 (`layout.gutter.*`, set in
`styles/global.css`).

### Grid

`<Grid>` lays out cards, panels and stat tiles in rows that always fill the
width:

```tsx
<Grid min="panel" maxColumns={4}>
  <Card title="Overdue">…</Card>
  …
</Grid>
```

- `min`: the kind of item, which sets its narrowest column
  (`layout.column.*`): `stat` 208, `card` 288, `panel` 384.
- `maxColumns`: the most items in a row on any screen (default 4).
- Each row holds as many items as fit, up to `maxColumns`, all the same
  width. A short last row shares out the width, so a lone last item is never
  stranded beside an empty gap.
- Items in a row share its height (`align="start"` to keep their own).
- Two grids with the same `min` and `maxColumns` in the same column line up
  exactly. A `ListPageTemplate`'s `summary` is a stat grid of four.
- Gaps are `layout.gap.grid` (16); sections are `layout.gap.section` (24) apart.

### Phones and tablets

At 390 and 768 nothing may scroll sideways (wide tables scroll inside their
own frame), and touch targets keep `--dp-size-target`. `apps/app/e2e/layout.spec.ts`
checks every screen at 390, 768, 1440 and 2560 in a real browser.
