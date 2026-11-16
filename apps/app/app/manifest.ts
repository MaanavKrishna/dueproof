/**
 * The web app manifest (03 §5): installable on phones ("Add to Home
 * Screen"), opening on Today, with shortcuts to Deadlines and Capture.
 * Colours come from the design tokens.
 */
import { resolveColor } from "@dueproof/tokens";
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Dueproof",
    short_name: "Dueproof",
    description: "Notices, deadlines and the page that proves them.",
    start_url: "/today?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: resolveColor("bg.canvas"),
    theme_color: resolveColor("accent.solid"),
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    shortcuts: [
      {
        name: "Deadlines",
        url: "/deadlines",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Capture a notice",
        short_name: "Capture",
        url: "/capture",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
