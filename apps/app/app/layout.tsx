import type { ReactNode } from "react";

export const metadata = { title: "Dueproof" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="light" data-density="comfortable">
      <body>{children}</body>
    </html>
  );
}
