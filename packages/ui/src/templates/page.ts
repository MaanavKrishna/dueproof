/**
 * How wide a page's content may go (packages/ui README, "Layout").
 *
 * - full: no limit. Dashboards, tables and calendars use the whole screen.
 * - wide: up to layout.page.wide. Records (a case, a client) and search.
 * - readable: up to layout.page.readable. Settings and other forms.
 * - narrow: up to layout.page.narrow. One task in one column (Capture).
 *
 * Below the limit every width is fluid with the same gutters. Above it the
 * page centres as one column: the title, banners and content move together,
 * so they always share a left edge.
 */
export type PageWidth = "full" | "wide" | "readable" | "narrow";

export const PAGE_WIDTHS: readonly PageWidth[] = ["full", "wide", "readable", "narrow"];
