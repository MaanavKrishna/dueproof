"use client";
/**
 * Client-side root providers. @dueproof/ui has no "use client" directives of
 * its own, so server components never import it directly: they render client
 * components like this one.
 */
import { UIProvider } from "@dueproof/ui";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return <UIProvider>{children}</UIProvider>;
}
