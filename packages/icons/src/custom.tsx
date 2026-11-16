/**
 * Dueproof's own icons, drawn on Lucide's 24 grid with a 1.5 stroke so they
 * sit beside Lucide icons without looking borrowed.
 */
import { createIcon } from "./icon";

const page = "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z";
const fold = "M14 3v5h5";

/** A notice: a page with its corner folded and a seal. */
export const NoticeIcon = /* @__PURE__ */ createIcon(
  "NoticeIcon",
  <>
    <path d={page} />
    <path d={fold} />
    <path d="M8.5 11.5h7" />
    <path d="M8.5 14.5h4" />
    <circle cx="15" cy="17.5" r="1.5" />
  </>,
);

/** A hearing: the bench and two parties before it. */
export const HearingIcon = /* @__PURE__ */ createIcon(
  "HearingIcon",
  <>
    <path d="M5 8V5.5a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1V8" />
    <path d="M3 8h18" />
    <circle cx="8" cy="13.5" r="1.75" />
    <circle cx="16" cy="13.5" r="1.75" />
    <path d="M5 20a3 3 0 0 1 6 0" />
    <path d="M13 20a3 3 0 0 1 6 0" />
  </>,
);

/** Proof: a page corner with a highlight stroke and a tick. */
export const ProofIcon = /* @__PURE__ */ createIcon(
  "ProofIcon",
  <>
    <path d="M12 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v4.5" />
    <path d={fold} />
    <rect
      x="8"
      y="10.5"
      width="7.5"
      height="3"
      rx="0.75"
      fill="currentColor"
      fillOpacity="0.3"
      stroke="none"
    />
    <path d="M8 12h7.5" />
    <path d="m14.5 18.5 2 2 4-4" />
  </>,
);

/** A receipt (acknowledgement of filing or payment). */
export const ReceiptIcon = /* @__PURE__ */ createIcon(
  "ReceiptIcon",
  <>
    <path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z" />
    <path d="M9 8h6" />
    <path d="M9 11.5h6" />
    <path d="M9 15h3" />
  </>,
);

/** GST: a page with a percent sign. */
export const GstIcon = /* @__PURE__ */ createIcon(
  "GstIcon",
  <>
    <path d={page} />
    <path d={fold} />
    <circle cx="9.5" cy="11.5" r="1" />
    <circle cx="14.5" cy="16.5" r="1" />
    <path d="m15 11-6 6" />
  </>,
);

/** Income tax: a page with a rupee sign. */
export const IncomeTaxIcon = /* @__PURE__ */ createIcon(
  "IncomeTaxIcon",
  <>
    <path d={page} />
    <path d={fold} />
    <path d="M9 10h6" />
    <path d="M9 12.75h6" />
    <path d="M11.5 10c1.6 0 2.5 1.1 2.5 2.4s-.9 2.35-2.5 2.35H9l4.25 3.75" />
  </>,
);

/** ROC (Registrar of Companies): a company building. */
export const RocIcon = /* @__PURE__ */ createIcon(
  "RocIcon",
  <>
    <path d="M5 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16" />
    <path d="M15 10h3a1 1 0 0 1 1 1v10" />
    <path d="M3 21h18" />
    <path d="M8 8h1M11 8h1M8 12h1M11 12h1M8 16h1M11 16h1" />
  </>,
);

/** A court: pediment and columns. */
export const CourtIcon = /* @__PURE__ */ createIcon(
  "CourtIcon",
  <>
    <path d="M3 8.5 12 3.5l9 5z" />
    <path d="M6 11v6.5M10 11v6.5M14 11v6.5M18 11v6.5" />
    <path d="M4 20.5h16" />
  </>,
);

/** Suggested by AI, not yet verified: sparkles. */
export const AiSuggestedIcon = /* @__PURE__ */ createIcon(
  "AiSuggestedIcon",
  <>
    <path d="M10 3.5 11.6 8.4 16.5 10l-4.9 1.6L10 16.5l-1.6-4.9L3.5 10l4.9-1.6z" />
    <path d="m17.5 14.5.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7L15 17l1.7-.8z" />
  </>,
);

/** Verified on the page: a rosette with a tick. */
export const VerifiedIcon = /* @__PURE__ */ createIcon(
  "VerifiedIcon",
  <>
    <path d="m12 3 2.1 1.6 2.6-.2.9 2.5 2.2 1.4-.7 2.5.7 2.5-2.2 1.4-.9 2.5-2.6-.2L12 21l-2.1-1.6-2.6.2-.9-2.5-2.2-1.4.7-2.5-.7-2.5 2.2-1.4.9-2.5 2.6.2z" />
    <path d="m9 12 2 2 4-4" />
  </>,
);

/** A case: a folder of linked documents. */
export const CaseIcon = /* @__PURE__ */ createIcon(
  "CaseIcon",
  <>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M7 13h10" />
  </>,
);

/** An order: a page with a stamp. */
export const OrderIcon = /* @__PURE__ */ createIcon(
  "OrderIcon",
  <>
    <path d={page} />
    <path d={fold} />
    <path d="M8.5 11h7" />
    <path d="M10 18.5h4" />
    <path d="M12 18.5V16" />
    <path d="M10.5 16h3l-.5-1.5h-2z" />
  </>,
);

/** An appeal: a page with an upward arrow. */
export const AppealIcon = /* @__PURE__ */ createIcon(
  "AppealIcon",
  <>
    <path d={page} />
    <path d={fold} />
    <path d="M12 18v-6.5" />
    <path d="m9.25 14.25 2.75-2.75 2.75 2.75" />
  </>,
);
