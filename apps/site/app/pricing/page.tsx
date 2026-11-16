import type { Metadata } from "next";
import Link from "next/link";
import { PageTitle } from "@/components/PageTitle";
import { REPO } from "@/lib/site";

export const metadata: Metadata = { title: "Pricing" };

export default function Pricing() {
  return (
    <>
      <PageTitle title="Free to run. Paid help when you want it.">
        <p>
          Everything one organisation needs to read its notices and trust the result is open source, and stays
          that way. Nothing that decides whether an entry is correct or provable is held back.
        </p>
      </PageTitle>

      <section className="band band-paper">
        <div className="wrap plans">
          <div className="plan is-now">
            <h2>Open source</h2>
            <p className="price">Free, Apache 2.0</p>
            <ul>
              <li>Every language, profile and rule</li>
              <li>Owners, corrections, history and the weekly email</li>
              <li>Search, exports and the evidence report</li>
              <li>Sign-in, single sign-on, audit trail, backups</li>
              <li>The accuracy harness</li>
            </ul>
            <Link className="btn btn-gilt" href="/docs/install/">Install it</Link>
          </div>
          <div className="plan">
            <h2>Hosted for you</h2>
            <p className="price">Planned</p>
            <ul>
              <li>We run and update it on a server that is yours alone</li>
              <li>Backups and monitoring handled</li>
              <li>The same open-source software, nothing different inside</li>
            </ul>
            <a className="btn btn-line" href={`${REPO}/issues/new`}>Tell us you need it</a>
          </div>
          <div className="plan">
            <h2>For larger teams</h2>
            <p className="price">Planned</p>
            <ul>
              <li>Connectors to document systems and mail servers</li>
              <li>Access control synced from your directory</li>
              <li>Support with an agreed response time</li>
              <li>Help writing a profile for your notices</li>
            </ul>
            <a className="btn btn-line" href={`${REPO}/issues/new`}>Start a conversation</a>
          </div>
        </div>
      </section>

      <section className="band">
        <div className="wrap split">
          <div className="measure">
            <h2 style={{ marginBottom: 16 }}>Why the line is drawn here</h2>
            <p className="muted">
              The paid plans are what larger deployments pay to avoid building and running themselves. The
              software that reads a notice is the same everywhere, so an entry means the same thing whoever runs
              it.
            </p>
          </div>
          <div className="measure">
            <h2 style={{ marginBottom: 16 }}>Nothing to buy today</h2>
            <p className="muted">
              Version 0.1 is for teams willing to run it themselves and tell us what it gets wrong. Paid plans
              will follow once the open version has proved itself on real notices.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
