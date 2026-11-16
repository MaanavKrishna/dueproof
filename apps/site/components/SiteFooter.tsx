import Link from "next/link";
import { LICENCE, RELEASED, REPO } from "@/lib/site";
import { Wordmark } from "./Brand";

export function SiteFooter() {
  return (
    <footer className="site-foot">
      <div className="wrap">
        <div className="foot-grid">
          <div className="stack">
            <p className="brand">
              <Wordmark />
            </p>
            <p className="muted small measure">
              Reads tax, regulatory and court notices, finds what is owed and by when, and proves every finding on
              the page it came from.
            </p>
            <p className="fine measure">{LICENCE.long}</p>
          </div>
          <div>
            <h2>Product</h2>
            <ul>
              <li><Link href="/product/">How it works</Link></li>
              <li><Link href="/use-cases/">Use cases</Link></li>
              <li><Link href="/languages/">Languages</Link></li>
              <li><Link href="/pricing/">Pricing</Link></li>
            </ul>
          </div>
          <div>
            <h2>Trust</h2>
            <ul>
              <li><Link href="/security/">Security and privacy</Link></li>
              <li><Link href="/docs/">Documentation</Link></li>
              <li><a href={`${REPO}/blob/main/LICENSE`}>Licence</a></li>
              <li><a href={`${REPO}/blob/main/SECURITY.md`}>Report a vulnerability</a></li>
            </ul>
          </div>
          <div>
            <h2>Project</h2>
            <ul>
              <li><a href={REPO}>Source code</a></li>
              <li><a href={`${REPO}/blob/main/ROADMAP.md`}>Roadmap</a></li>
              <li><a href={`${REPO}/issues`}>Report a problem</a></li>
              <li><a href={`${REPO}/blob/main/CONTRIBUTING.md`}>Contributing</a></li>
            </ul>
          </div>
        </div>
        <div className="foot-base fine">
          <span>This website sets no cookies and runs no analytics.</span>
          <span>Available today: the {RELEASED}.</span>
        </div>
      </div>
    </footer>
  );
}
