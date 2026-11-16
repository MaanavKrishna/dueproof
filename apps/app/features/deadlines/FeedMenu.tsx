"use client";
/** Subscribe to deadlines in a calendar app (iCal), or turn the feed links off. */
import { CalendarIcon, CopyIcon } from "@dueproof/icons";
import {
  Button,
  Dialog,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  TextField,
  useToast,
} from "@dueproof/ui";
import { useState } from "react";
import { createCalendarFeed, revokeCalendarFeeds } from "./actions";
import styles from "./deadlines.module.css";

export function FeedMenu() {
  const [url, setUrl] = useState<string | null>(null);
  const { toast } = useToast();
  async function create(scope: "me" | "org") {
    const res = await createCalendarFeed(scope);
    if (res.ok) setUrl(res.data.url);
    else toast({ title: "Couldn't make a feed", description: res.message, tone: "danger" });
  }
  async function revoke() {
    const res = await revokeCalendarFeeds();
    toast(
      res.ok
        ? {
            title: "Calendar feeds turned off",
            description: "Links you made before now stop working.",
            tone: "success",
          }
        : { title: "Couldn't turn feeds off", description: res.message, tone: "danger" },
    );
  }
  return (
    <>
      <Menu>
        <MenuTrigger>
          <Button icon={CalendarIcon}>Subscribe (iCal)</Button>
        </MenuTrigger>
        <MenuContent align="end">
          <MenuItem onSelect={() => create("me")} description="Deadlines you own">
            My deadlines
          </MenuItem>
          <MenuItem onSelect={() => create("org")} description="Everything in the organisation">
            All deadlines
          </MenuItem>
          <MenuSeparator />
          <MenuItem destructive onSelect={revoke}>
            Turn off my feed links
          </MenuItem>
        </MenuContent>
      </Menu>
      <Dialog
        open={url !== null}
        onOpenChange={(o) => {
          if (!o) setUrl(null);
        }}
        title="Calendar feed"
        description="Add this link to Google Calendar, Outlook or Apple Calendar as a subscription. It shows titles and dates only. Keep it private: anyone with the link can read it until you turn it off."
        size="md"
      >
        <div className={styles.stack}>
          <TextField
            label="Feed link"
            readOnly
            value={url ?? ""}
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className={styles.formActions}>
            <Button
              icon={CopyIcon}
              variant="primary"
              onClick={async () => {
                if (url) await navigator.clipboard?.writeText(url).catch(() => undefined);
                toast({ title: "Link copied", tone: "success" });
              }}
            >
              Copy link
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
