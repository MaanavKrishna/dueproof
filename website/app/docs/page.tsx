import type { Metadata } from "next";
import { DocsShell } from "@/components/DocsShell";
import { readDoc } from "@/lib/docs";

export const metadata: Metadata = { title: "Documentation" };

export default function DocsIndex() {
  return <DocsShell doc={readDoc("index")} />;
}
