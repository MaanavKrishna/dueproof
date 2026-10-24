import Link from "next/link";
import { REPO, VERSION } from "@/lib/site";
import { Mark } from "./Mark";

export function SiteFooter() {
  return (
    <footer className="site-foot cloth">
      <div className="wrap foot-grid">
        <div>
          <p className="brand"><Mark size={20} />Dueproof</p>
          <p className="muted small">Version {VERSION}. Open source under Apache 2.0.<br />
            Runs on your own server; this website collects nothing.</p>
        </div>
        <div>
          <h2>Product</h2>
          <ul>
            <li><Link href="/product/">How it works</Link></li>
            <li><Link href="/use-cases/">Who it's for</Link></li>
            <li><Link href="/languages/">Languages</Link></li>
            <li><Link href="/pricing/">Pricing</Link></li>
          </ul>
        </div>
        <div>
          <h2>Run it</h2>
          <ul>
            <li><Link href="/docs/install/">Install</Link></li>
            <li><Link href="/docs/quickstart/">Quickstart</Link></li>
            <li><Link href="/docs/deployment/">Deployment</Link></li>
            <li><Link href="/security/">Security</Link></li>
          </ul>
        </div>
        <div>
          <h2>Project</h2>
          <ul>
            <li><a href={REPO}>Source code</a></li>
            <li><a href={`${REPO}/issues`}>Report a problem</a></li>
            <li><a href={`${REPO}/blob/main/ROADMAP.md`}>Roadmap</a></li>
            <li><a href={`${REPO}/blob/main/CONTRIBUTING.md`}>Contributing</a></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
