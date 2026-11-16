import { connection } from "next/server";
import type { ReactNode } from "react";

export const metadata = { title: "Dueproof" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Render per request: the CSP nonce (proxy.ts) only reaches pages rendered
  // after the request arrives, never prerendered ones (05 §3).
  await connection();
  return (
    <html lang="en" data-theme="light" data-density="comfortable">
      <body>{children}</body>
    </html>
  );
}
