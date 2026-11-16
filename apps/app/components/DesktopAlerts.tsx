"use client";
/**
 * OS alerts in the desktop app. Its webviews have no Web Push, so while the
 * app is open we poll for the person's new notifications and raise each with
 * `new Notification()`, which the desktop shell's bridge forwards to the OS.
 * Does nothing in a browser (no `window.dueproofDesktop`): there, Web Push
 * through the service worker does this job.
 */
import { useEffect } from "react";
import { newNotifications } from "@/app/actions/notifications";

declare global {
  interface Window {
    dueproofDesktop?: { platform: string; version: string };
  }
}

/** How often to look for new notifications, ms. */
export const DESKTOP_POLL_MS = 60_000;

export function DesktopAlerts() {
  useEffect(() => {
    if (typeof window === "undefined" || !window.dueproofDesktop) return;
    if (typeof Notification === "undefined") return;
    // Only what arrives from now on: older ones are in the app already.
    let since = new Date().toISOString();
    let stopped = false;
    const poll = async () => {
      const res = await newNotifications(since).catch(() => null);
      if (stopped || !res?.ok) return;
      for (const alert of res.data) {
        since = alert.createdAt;
        new Notification(alert.title, { body: "Open Dueproof to see it.", tag: alert.id });
      }
    };
    const timer = window.setInterval(() => void poll(), DESKTOP_POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, []);
  return null;
}
