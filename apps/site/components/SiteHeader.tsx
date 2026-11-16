"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { APP_URL, NAV, RELEASED, REPO } from "@/lib/site";
import { Wordmark } from "./Brand";
import { CloseIcon, MenuIcon } from "./icons";

export function SiteHeader() {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  // Close the menu on navigation, and with Escape.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on each navigation by design
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  const current = (href: string) =>
    path === href || (href !== "/" && path.startsWith(href)) ? "page" : undefined;

  return (
    <>
      <div className="status-strip">
        <p className="wrap">
          <span>
            Dueproof {RELEASED} is out. Use it hosted at <a href={APP_URL}>dueproof-app.vercel.app</a>,
            or run it on your own server.
          </span>
          <a href={`${REPO}/blob/main/ROADMAP.md`}>Roadmap</a>
        </p>
      </div>
      <header className={`site-head${open ? " is-open" : ""}`}>
        <div className="wrap head-row">
          <Link className="brand" href="/" aria-label="Dueproof, home">
            <Wordmark />
          </Link>
          <button
            type="button"
            className="menu-btn"
            aria-expanded={open}
            aria-controls="site-nav"
            onClick={() => setOpen(!open)}
          >
            {open ? <CloseIcon size={22} /> : <MenuIcon size={22} />}
            <span className="sr-only">{open ? "Close menu" : "Menu"}</span>
          </button>
          <nav className="nav" id="site-nav" aria-label="Site">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} aria-current={current(n.href)}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="head-actions">
            <a className="cta cta-secondary cta-sm" href={REPO}>
              GitHub
            </a>
            <Link className="cta cta-primary cta-sm" href="/pricing/">
              Get Dueproof
            </Link>
          </div>
        </div>
      </header>
    </>
  );
}
