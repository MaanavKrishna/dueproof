import type { ReactNode } from "react";
import { NOTICE } from "@/lib/sample";

/** The sample GST notice as a white page. `proof` replaces the outlined sentence. */
export function NoticePaper({
  proof,
  stamp,
  className = "",
  style,
}: {
  proof?: ReactNode;
  stamp?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`paper ${className}`} style={style}>
      {stamp}
      <div className="paper-head">
        {NOTICE.office.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      <div className="paper-ref">
        <span>Ref: {NOTICE.reference}</span>
        <span>Date: {NOTICE.dated}</span>
      </div>
      <p>To: {NOTICE.to}</p>
      <p className="subject">Subject: {NOTICE.subject}</p>
      <p>{NOTICE.opening}</p>
      {proof ?? (
        <p className="proof-box">
          <span className="hl" aria-hidden="true" />
          <span className="ol" aria-hidden="true" />
          {NOTICE.proof}
        </p>
      )}
      <p>{NOTICE.hearing}</p>
      <div className="ghost-lines" aria-hidden="true">
        <i style={{ width: "92%" }} />
        <i style={{ width: "86%" }} />
        <i style={{ width: "58%" }} />
      </div>
    </div>
  );
}
