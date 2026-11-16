"use client";
/**
 * Install guidance for phones (03 §5): the browser's own install prompt
 * where it offers one (Android, desktop Chrome and Edge), and the Share →
 * "Add to Home Screen" steps on iPhone and iPad. Hidden once installed.
 * Also registers the service worker (app shell only; no data is cached).
 *
 *   <InstallGuide />   // in the app frame or Settings → Me
 */
import { Banner, Button } from "@dueproof/ui";
import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED = "dueproof.install.dismissed";

export function InstallGuide({ register = true }: { register?: boolean }) {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (register && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone || localStorage.getItem(DISMISSED)) return;
    const small = window.matchMedia("(max-width: 48rem)").matches;
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIos(isIos && small);
    setHidden(!(isIos && small));
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
      setHidden(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, [register]);

  if (hidden) return null;
  const dismiss = () => {
    localStorage.setItem(DISMISSED, "1");
    setHidden(true);
  };
  return (
    <Banner
      tone="info"
      title="Put Dueproof on your Home Screen"
      onDismiss={dismiss}
      actions={
        prompt ? (
          <Button
            size="sm"
            variant="primary"
            onClick={async () => {
              await prompt.prompt();
              await prompt.userChoice;
              setPrompt(null);
              setHidden(true);
            }}
          >
            Install
          </Button>
        ) : undefined
      }
    >
      {ios
        ? "Tap Share, then “Add to Home Screen”. It opens like an app, and can show notifications once you turn them on."
        : "Install it to open Dueproof like an app, capture notices with the camera and get notifications."}
    </Banner>
  );
}
