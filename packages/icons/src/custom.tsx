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

/** A statutory filing: a page going into a tray (GSTR, TDS return, ROC form). */
export const StatutoryFilingIcon = /* @__PURE__ */ createIcon(
  "StatutoryFilingIcon",
  <>
    <path d="M8 13V4.5a1.5 1.5 0 0 1 1.5-1.5H15l3 3v7" />
    <path d="M15 3v3h3" />
    <path d="M10.5 8h4" />
    <path d="M3 13h5l1.5 2.5h5L16 13h5v5.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" />
  </>,
);

/** SEBI: a market regulator, a pillar with a rising line. */
export const SebiIcon = /* @__PURE__ */ createIcon(
  "SebiIcon",
  <>
    <path d="M3 20.5h18" />
    <path d="M5 20.5V12" />
    <path d="M9.5 20.5V9" />
    <path d="M14 20.5V13" />
    <path d="M18.5 20.5V7" />
    <path d="m4 8 5-4 4.5 4L20 3" />
  </>,
);

/** RBI: the central bank, a building with a rupee pediment. */
export const RbiIcon = /* @__PURE__ */ createIcon(
  "RbiIcon",
  <>
    <path d="M3 9 12 3.5 21 9z" />
    <path d="M5 11.5v6M9.5 11.5v6M14.5 11.5v6M19 11.5v6" />
    <path d="M3.5 20.5h17" />
    <path d="M10.5 5.75h3M10.5 7h1.5" />
  </>,
);

/** TDS: tax deducted at source, a rupee coin with a cut. */
export const TdsIcon = /* @__PURE__ */ createIcon(
  "TdsIcon",
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9 8h6M9 10.5h6" />
    <path d="M10.5 8a2.5 2.5 0 0 1 0 5H9l4.5 3.5" />
    <path d="m17 4 3-1" />
  </>,
);

/** The statutory compliance calendar: a calendar with a rule mark. */
export const CalendarStatutoryIcon = /* @__PURE__ */ createIcon(
  "CalendarStatutoryIcon",
  <>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 9.5h17" />
    <path d="M8 3v4M16 3v4" />
    <path d="M7.5 13.5h4M7.5 16.5h2.5" />
    <path d="m14 15 1.5 1.5 3-3" />
  </>,
);

/** Approval: a seal with a tick, for partner approval of a reply. */
export const ApprovalIcon = /* @__PURE__ */ createIcon(
  "ApprovalIcon",
  <>
    <circle cx="12" cy="9.5" r="6" />
    <path d="m9.5 9.5 1.75 1.75L14.75 8" />
    <path d="M8.5 14.5 7 21l5-2.5 5 2.5-1.5-6.5" />
  </>,
);

/** Filed, with acknowledgement: a page with a tick and an ARN line. */
export const FiledAckIcon = /* @__PURE__ */ createIcon(
  "FiledAckIcon",
  <>
    <path d={page} />
    <path d={fold} />
    <path d="m9 13 2 2 4-4" />
    <path d="M9 18h6" />
  </>,
);

/** Intake by WhatsApp: a chat bubble with a page in it. */
export const WhatsappIntakeIcon = /* @__PURE__ */ createIcon(
  "WhatsappIntakeIcon",
  <>
    <path d="M4.5 19.5 5.6 16A8.5 8.5 0 1 1 8.4 18.6z" />
    <path d="M10 8.5h3l1.5 1.5v4.5h-4.5z" />
  </>,
);

/** Exposure: demand, interest and penalty stacked as heads. */
export const ExposureIcon = /* @__PURE__ */ createIcon(
  "ExposureIcon",
  <>
    <path d="M3.5 20.5h17" />
    <rect x="5" y="12" width="4" height="8.5" rx="1" />
    <rect x="10" y="8" width="4" height="12.5" rx="1" />
    <rect x="15" y="4" width="4" height="16.5" rx="1" />
  </>,
);

/** Hearing pack: a bound bundle of pages with a gavel tab. */
export const HearingPackIcon = /* @__PURE__ */ createIcon(
  "HearingPackIcon",
  <>
    <path d="M6 5.5h10.5a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H6z" />
    <path d="M6 5.5V4.5A1.5 1.5 0 0 1 7.5 3h9" />
    <path d="M6 5.5v15.5" />
    <path d="M9.5 10h5.5M9.5 13h5.5M9.5 16h3" />
    <path d="M18.5 8.5h2v4h-2" />
  </>,
);
