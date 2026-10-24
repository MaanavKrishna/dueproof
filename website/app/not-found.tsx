import Link from "next/link";
import { PageTitle } from "@/components/PageTitle";

export default function NotFound() {
  return (
    <>
      <PageTitle title="No entry under that number">
        <p>The page you asked for isn't here. It may have moved when the site was rebuilt.</p>
      </PageTitle>
      <div className="wrap" style={{ paddingBottom: 96 }}>
        <div className="actions">
          <Link className="btn btn-ink" href="/">Go to the home page</Link>
          <Link className="btn btn-line" href="/docs/">Read the documentation</Link>
        </div>
      </div>
    </>
  );
}
