import type { Metadata } from "next";
import { DocsShell } from "@/components/DocsShell";
import { SLUGS, readDoc } from "@/lib/docs";

export const dynamicParams = false;

export function generateStaticParams() {
  return SLUGS.filter((s) => s !== "index").map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: readDoc((await params).slug).title };
}

export default async function DocPage({ params }: Props) {
  return <DocsShell doc={readDoc((await params).slug)} />;
}
