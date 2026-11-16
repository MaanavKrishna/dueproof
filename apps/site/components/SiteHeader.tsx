"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV, REPO } from "@/lib/site";
import { Mark } from "./Mark";

export function SiteHeader() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => setOpen(false), [path]);

  const current = (href: string) =>
    path === href || (href !== "/" && path.startsWith(href)) ? "page" : undefined;

  return (
    <header className={`site-head${scrolled ? " is-scrolled" : ""}${open ? " is-open" : ""}`}>
      <div className="wrap head-row">
        <Link className="brand" href="/"><Mark />Dueproof</Link>
        <button className="menu-btn" aria-expanded={open} aria-controls="site-nav" onClick={() => setOpen(!open)}>
          {open ? "Close" : "Menu"}
        </button>
        <nav className="nav" id="site-nav" aria-label="Site">
          {NAV.map((n) => <Link key={n.href} href={n.href} aria-current={current(n.href)}>{n.label}</Link>)}
        </nav>
        <a className="btn btn-line head-gh" href={REPO}>GitHub</a>
      </div>
    </header>
  );
}
