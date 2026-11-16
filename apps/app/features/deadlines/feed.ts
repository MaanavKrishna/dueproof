/**
 * The open deadlines a calendar feed shows: the person's own, or the
 * organisation's. Titles and dates only (05 §4): no client names or amounts.
 */
import "server-only";
import { addMonths } from "@dueproof/core";
import { eq, type OrgTx, orgSettings } from "@dueproof/db";
import { queryDeadlines } from "@/lib/deadline-rows";
import { todayIn } from "@/lib/pipeline/status";
import { type FeedEvent, type FeedToken, renderIcs } from "./ical";

const SOURCE_WORD = {
  notice: "Notice",
  order: "Order",
  statutory: "Statutory filing",
  manual: "Added by hand",
} as const;

export async function renderFeed(tx: OrgTx, claim: FeedToken, appUrl: string): Promise<string> {
  const [settings] = await tx
    .select({ timezone: orgSettings.timezone })
    .from(orgSettings)
    .where(eq(orgSettings.orgId, claim.orgId))
    .limit(1);
  const today = todayIn(settings?.timezone ?? "Asia/Kolkata");
  const rows = await queryDeadlines(tx, claim.orgId, today, {
    statuses: ["open"],
    from: addMonths(today, -2).date,
    ...(claim.scope === "me" ? { ownerIds: [claim.userId] } : {}),
  });
  const events: FeedEvent[] = [];
  for (const r of rows) {
    events.push({
      id: r.id,
      title: r.title,
      date: r.dueOn,
      description: SOURCE_WORD[r.source],
      url: new URL("/deadlines", appUrl).toString(),
    });
    if (r.windowEndOn) {
      events.push({
        id: `${r.id}-window`,
        title: `Condonation window ends: ${r.title}`,
        date: r.windowEndOn,
        description: "The extra period an authority may allow.",
      });
    }
  }
  return renderIcs(
    claim.scope === "me" ? "Dueproof: my deadlines" : "Dueproof: all deadlines",
    events,
  );
}
