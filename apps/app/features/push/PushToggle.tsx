"use client";
/**
 * Phone and browser notifications, opt-in per device (for Settings → Me).
 * Registers the service worker, asks the browser for permission only when
 * the person turns it on, and says plainly what is sent and where.
 *
 *   <PushToggle />
 */
import { Banner, Switch } from "@dueproof/ui";
import { useEffect, useState } from "react";
import { pushConfig, subscribePush, unsubscribePush } from "./actions";

type State = "loading" | "unsupported" | "ios-install" | "disabled" | "denied" | "off" | "on";

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        setState(isIos() && !isStandalone() ? "ios-install" : "unsupported");
        return;
      }
      const cfg = await pushConfig();
      if (!cfg.ok || !cfg.data.enabled) return setState("disabled");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await registerServiceWorker();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        // Keep the server's copy current (keys can rotate).
        await subscribePush(sub.toJSON() as Parameters<typeof subscribePush>[0]);
        setState("on");
      } else setState("off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function turnOn() {
    setBusy(true);
    setError(null);
    try {
      const cfg = await pushConfig();
      if (!cfg.ok || !cfg.data.enabled) return setState("disabled");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "denied" : "off");
      const reg = await registerServiceWorker();
      if (!reg) return setState("unsupported");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64ToBytes(cfg.data.publicKey),
      });
      const res = await subscribePush(sub.toJSON() as Parameters<typeof subscribePush>[0]);
      if (!res.ok) {
        await sub.unsubscribe();
        setError(res.message);
        return;
      }
      setState("on");
    } catch {
      setError("This browser couldn't turn notifications on.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await unsubscribePush(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  if (state === "ios-install") {
    return (
      <Banner tone="info" title="Add Dueproof to your Home Screen first">
        On iPhone and iPad, notifications work once the app is on the Home Screen: tap Share, then
        “Add to Home Screen”, open Dueproof from there and turn notifications on here.
      </Banner>
    );
  }
  if (state === "unsupported") {
    return (
      <Banner tone="neutral" title="This browser can't show notifications from Dueproof">
        The morning email digest still covers what's due.
      </Banner>
    );
  }
  if (state === "disabled") {
    return (
      <Banner tone="neutral" title="Phone notifications are off for this install">
        An admin has switched them off. The morning email digest covers what's due.
      </Banner>
    );
  }
  return (
    <>
      <Switch
        label="Notifications on this device"
        description={
          state === "denied"
            ? "Notifications are blocked for this site in the browser's settings. Allow them there, then come back."
            : "Only a short line such as “A deadline needs attention”: never client names, amounts or notice text. Sent through your browser's push service (Apple, Google or Mozilla)."
        }
        checked={state === "on"}
        disabled={busy || state === "loading" || state === "denied"}
        onCheckedChange={(on) => (on ? turnOn() : turnOff())}
      />
      {error ? (
        <Banner tone="danger" title="Couldn't turn notifications on">
          {error}
        </Banner>
      ) : null}
    </>
  );
}
