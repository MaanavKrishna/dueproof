/**
 * Fake data for stories: an Indian CA firm (Mehta Iyer & Associates, Mumbai)
 * with its clients, a GST ASMT-10 notice, findings, deadlines in IST dates,
 * and a 5 000-row register. Every name, number and notice here is invented.
 */
import {
  HistoryIcon as ActivityIcon,
  AiSuggestedIcon,
  BellIcon,
  CalendarDaysIcon,
  ClientIcon,
  ExposureIcon,
  HomeIcon,
  InboxIcon,
  LinkIcon,
  ListChecksIcon,
  MonitorIcon,
  NoticeIcon,
  ClientIcon as OrgIcon,
  DocumentIcon as ReportIcon,
  SearchIcon,
  SettingsIcon,
  UserIcon,
  UsersIcon,
  WhatsappIntakeIcon,
} from "@dueproof/icons";
import type { ActivityItem } from "../components/ActivityFeed/ActivityFeed";
import type { CalendarEvent, CalendarHoliday } from "../components/Calendar/Calendar";
import { gstinCheckChar } from "../components/ClientHeader/identifiers";
import type { DueState } from "../components/DueChip/DueChip";
import type { ExposureRow } from "../components/ExposureSummary/ExposureSummary";
import type { UploadItem } from "../components/FileDropZone/UploadTray";
import type { FilterDefinition } from "../components/FilterBar/FilterBar";
import type { NotificationItem } from "../components/NotificationCenter/NotificationCenter";
import type { ProofHighlight, ProofPage } from "../components/ProofViewer/ProofViewer";
import type { SettingsNavItem } from "../components/SettingsLayout/SettingsLayout";
import type { SidebarNavSection } from "../components/SidebarNav/SidebarNav";
import type { CaseStage } from "../components/StageStepper/StageStepper";
import page1 from "./assets/asmt10-page-1.svg";
import page2 from "./assets/asmt10-page-2.svg";

export const TODAY = "2026-11-16";

/** A GSTIN with a correct check character. */
export function gstin(state: string, pan: string, entity = "1"): string {
  const body = `${state}${pan}${entity}Z`;
  return body + gstinCheckChar(body);
}

export const people = [
  { id: "u1", name: "Priya Sharma", role: "Partner" },
  { id: "u2", name: "Rahul Mehta", role: "Manager" },
  { id: "u3", name: "Ananya Iyer", role: "Senior associate" },
  { id: "u4", name: "Vikram Rao", role: "Article assistant" },
  { id: "u5", name: "Farah Khan", role: "Associate" },
];

export interface Client {
  id: string;
  name: string;
  city: string;
  pan: string;
  gstin: string;
  cin?: string;
  tan?: string;
}

export const clients: Client[] = [
  {
    id: "c1",
    name: "Harbour Valley Foods Pvt Ltd",
    city: "Mumbai",
    pan: "AAACH1234M",
    gstin: gstin("27", "AAACH1234M"),
    cin: "U15400MH2012PTC234567",
    tan: "MUMH12345C",
  },
  {
    id: "c2",
    name: "Anand Textiles LLP",
    city: "Surat",
    pan: "AAGFA5678K",
    gstin: gstin("24", "AAGFA5678K"),
  },
  {
    id: "c3",
    name: "Zenith Pharma Ltd",
    city: "Hyderabad",
    pan: "AABCZ9012P",
    gstin: gstin("36", "AABCZ9012P"),
  },
  {
    id: "c4",
    name: "Kaveri Agro Exports",
    city: "Coimbatore",
    pan: "AAJFK3456Q",
    gstin: gstin("33", "AAJFK3456Q"),
  },
  {
    id: "c5",
    name: "Northwind Logistics Pvt Ltd",
    city: "New Delhi",
    pan: "AACCN7890R",
    gstin: gstin("07", "AACCN7890R"),
  },
  {
    id: "c6",
    name: "Sahyadri Constructions Pvt Ltd",
    city: "Pune",
    pan: "AAKCS2345T",
    gstin: gstin("27", "AAKCS2345T"),
  },
  {
    id: "c7",
    name: "Lotus Hospitality Ltd",
    city: "Bengaluru",
    pan: "AABCL6789L",
    gstin: gstin("29", "AABCL6789L"),
  },
  {
    id: "c8",
    name: "Meridian Software Pvt Ltd",
    city: "Bengaluru",
    pan: "AAECM1122N",
    gstin: gstin("29", "AAECM1122N"),
  },
];

export const harbour = clients[0] as Client;

export const navSections = (counts = { inbox: 12, overdue: 3 }): SidebarNavSection[] => [
  {
    id: "main",
    items: [
      { id: "today", label: "Today", icon: HomeIcon, href: "#today", shortcut: "G T" },
      { id: "inbox", label: "Inbox", icon: InboxIcon, href: "#inbox", count: counts.inbox },
      { id: "notices", label: "Notices", icon: NoticeIcon, href: "#notices", count: 142 },
      {
        id: "deadlines",
        label: "Deadlines",
        icon: CalendarDaysIcon,
        href: "#deadlines",
        count: counts.overdue,
        countTone: "attention",
      },
      { id: "clients", label: "Clients", icon: ClientIcon, href: "#clients" },
    ],
  },
  {
    id: "insight",
    title: "Insight",
    items: [
      { id: "ask", label: "Ask", icon: SearchIcon, href: "#ask" },
      { id: "exposure", label: "Exposure", icon: ExposureIcon, href: "#exposure" },
      { id: "reports", label: "Reports", icon: ReportIcon, href: "#reports" },
      { id: "activity", label: "Activity", icon: ActivityIcon, href: "#activity" },
    ],
  },
  {
    id: "org",
    title: "Firm",
    items: [{ id: "settings", label: "Settings", icon: SettingsIcon, href: "#settings" }],
  },
];

/* ---------------- The ASMT-10 notice ---------------- */

export const asmt10Pages: ProofPage[] = [
  {
    number: 1,
    src: page1,
    width: 595,
    height: 842,
    unit: "pt",
    text: `GOVERNMENT OF INDIA
Central Board of Indirect Taxes and Customs
FORM GST ASMT-10 [See rule 99(1)]
Reference No: ZD2710260012345    Date: 21/10/2026
To, M/s Harbour Valley Foods Private Limited, GSTIN: ${harbour.gstin}
Tax period: April 2025 to March 2026 (FY 2025-26)
Subject: Notice for intimating discrepancies in the return after scrutiny
This is to inform you that during scrutiny of the returns filed by you for the tax period mentioned above, the following discrepancies were noticed under section 61 of the CGST Act, 2017 read with rule 99 of the CGST Rules, 2017:
1. ITC availed in GSTR-3B in excess of GSTR-2B — 3,18,400
2. Outward supplies in GSTR-1 not in GSTR-3B — 1,33,900
Total tax — 4,52,300
You are hereby directed to explain the reasons for the aforesaid discrepancies by reply within a period of thirty days from the date of service of this notice.
If no satisfactory explanation is furnished within the period specified above, action may be initiated under section 73 or section 74 of the Act without further reference to you.`,
  },
  {
    number: 2,
    src: page2,
    width: 1240,
    height: 1754,
    unit: "px",
    text: `ANNEXURE TO FORM GST ASMT-10
Month-wise details of input tax credit (Rs.)
Excess ITC: Rs. 3,18,400
Personal hearing, if requested: 27 Nov 2026 at 11:30, Room 304, Andheri.`,
  },
];

/** The same notice as if it had been issued in Hindi, with its English translation. */
export const asmt10PagesHindi: ProofPage[] = asmt10Pages.map((p) =>
  p.number === 1
    ? {
        ...p,
        text: "आपको निर्देश दिया जाता है कि इस नोटिस की तामील की तारीख से तीस दिनों की अवधि के भीतर उत्तर द्वारा उपर्युक्त विसंगतियों के कारणों की व्याख्या करें। कुल कर — 4,52,300",
        translation:
          "You are directed to explain the reasons for the above discrepancies by reply within a period of thirty days from the date of service of this notice. Total tax — 4,52,300",
      }
    : p,
);

export const asmt10Highlights: ProofHighlight[] = [
  {
    id: "h-due",
    page: 1,
    rects: [[73.2, 499.2, 246.2, 509.7]],
    label: "reply due 20 Nov 2026",
    quote: "reply within a period of thirty days",
    grade: "exact",
  },
  {
    id: "h-amount",
    page: 1,
    rects: [[365, 442.6, 403, 452.5]],
    label: "tax ₹4,52,300",
    quote: "4,52,300",
    grade: "exact",
  },
  {
    id: "h-section",
    page: 1,
    rects: [[396.2, 337.2, 445.8, 347.7]],
    label: "under section 61",
    quote: "section 61",
    grade: "strong",
  },
  {
    id: "h-period",
    page: 1,
    rects: [[116, 262.2, 293.8, 272.7]],
    label: "tax period FY 2025–26",
    quote: "April 2025 to March 2026 (FY 2025-26)",
    grade: "exact",
  },
  {
    id: "h-hearing",
    page: 2,
    rects: [[123, 817, 642, 839]],
    label: "personal hearing 27 Nov 2026, 11:30",
    quote: "Personal hearing, if requested: 27 Nov 2026 at 11:30",
    grade: "approximate",
  },
  {
    id: "h-itc",
    page: 2,
    rects: [],
    label: "ITC reversal with interest",
    grade: "unlocated",
  },
];

export interface Finding {
  id: string;
  highlightId: string;
  duty: string;
  due?: { state: DueState; date: string };
  basis?: string;
  condonation?: { date: string; basis: string };
  owner?: { name: string };
  status: { label: string; tone: "neutral" | "accent" | "success" | "warning" | "danger" | "info" };
  origin: "rule" | "ai" | "rule+ai" | "human";
  verification: { state: "verified" | "suggested"; page?: number };
  grade: "exact" | "strong" | "approximate" | "unlocated";
  quote?: string;
  needsReview?: boolean;
  reviewReason?: string;
}

export const asmt10Findings: Finding[] = [
  {
    id: "f1",
    highlightId: "h-due",
    duty: "Reply to the notice explaining the ITC and outward-supply differences",
    due: { state: "week", date: "20 Nov 2026" },
    basis: "30 days from receipt on 21 Oct 2026",
    owner: { name: "Ananya Iyer" },
    status: { label: "Drafting", tone: "accent" },
    origin: "rule",
    verification: { state: "verified", page: 1 },
    grade: "exact",
    quote: "reply within a period of thirty days from the date of service of this notice",
  },
  {
    id: "f2",
    highlightId: "h-hearing",
    duty: "Attend the personal hearing at CGST Range IV, Andheri (if requested)",
    due: { state: "later", date: "27 Nov 2026, 11:30" },
    basis: "Stated on the annexure",
    owner: { name: "Rahul Mehta" },
    status: { label: "Open", tone: "neutral" },
    origin: "rule+ai",
    verification: { state: "verified", page: 2 },
    grade: "approximate",
  },
  {
    id: "f3",
    highlightId: "h-itc",
    duty: "Reverse excess ITC of ₹3,18,400 with interest under section 50",
    origin: "ai",
    verification: { state: "suggested" },
    grade: "unlocated",
    status: { label: "Needs review", tone: "warning" },
    needsReview: true,
    reviewReason: "The AI suggested this, but the quote wasn't found on the page.",
  },
];

export const asmt10Order = {
  duty: "File an appeal against the order in Form GST APL-01",
  due: { state: "later" as DueState, date: "20 Feb 2027" },
  basis: "3 months from communication of the order on 20 Nov 2026 (section 107(1))",
  condonation: {
    date: "20 Mar 2027",
    basis: "plus 1 month if the delay is condoned (section 107(4))",
  },
};

/* ---------------- Register rows ---------------- */

export interface NoticeRow {
  id: string;
  client: string;
  gstin: string;
  type: string;
  reference: string;
  issuedBy: string;
  received: string;
  receivedIso: string;
  nextDue: { state: DueState; date: string; iso: string } | null;
  stage: CaseStage;
  demand: number;
  owner: string;
  language: string;
  channel: "Email" | "Upload" | "WhatsApp" | "Portal";
}

const types = [
  "GST · ASMT-10",
  "GST · DRC-01",
  "GST · DRC-01A",
  "GST · REG-17",
  "Income tax · 143(1)",
  "Income tax · 148A(b)",
  "Income tax · 142(1)",
  "TDS · 200A intimation",
  "ROC · Adjudication",
];
const offices = [
  "CGST Range IV, Andheri",
  "SGST Ward 12, Pune",
  "Asst. Commissioner, Surat",
  "ITO Ward 3(2)(1), Mumbai",
  "DCIT Circle 1(1), Bengaluru",
  "CPC TDS, Ghaziabad",
  "ROC Mumbai",
];
const stages: CaseStage[] = [
  "received",
  "gathering",
  "drafting",
  "approval",
  "filed",
  "order",
  "appeal",
  "closed",
];
const languages = [
  "English",
  "English",
  "English",
  "Hindi",
  "Marathi",
  "Gujarati",
  "Tamil",
  "Telugu",
  "Kannada",
];
const channels: NoticeRow["channel"][] = ["Email", "Upload", "WhatsApp", "Portal"];
const monthsShort = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function rand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function isoPlus(base: string, days: number): string {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmt(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${Number(d)} ${monthsShort[Number(m) - 1]} ${y}`;
}

function dueState(iso: string, stage: CaseStage): DueState {
  if (stage === "closed" || stage === "filed") return "done";
  const diff = (Date.parse(iso) - Date.parse(TODAY)) / 86_400_000;
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff <= 7) return "week";
  return "later";
}

/** A deterministic register of `count` cases. */
export function makeNotices(count: number, seed = 7): NoticeRow[] {
  const r = rand(seed);
  const pick = <T>(list: readonly T[]) => list[Math.floor(r() * list.length)] as T;
  return Array.from({ length: count }, (_, i) => {
    const client = i === 0 ? harbour : pick(clients);
    const receivedIso = isoPlus(TODAY, -Math.floor(r() * 60));
    const stage = i === 0 ? "drafting" : pick(stages);
    const dueIso = isoPlus(receivedIso, 30 + Math.floor(r() * 60));
    const hasDue = r() > 0.06;
    return {
      id: `case-${i + 1}`,
      client: client.name,
      gstin: client.gstin,
      type: i === 0 ? "GST · ASMT-10" : pick(types),
      reference:
        i === 0
          ? "ZD2710260012345"
          : `ZD${27 + (i % 9)}10${String(260000000 + i * 7919).slice(-9)}`,
      issuedBy: i === 0 ? "CGST Range IV, Andheri" : pick(offices),
      received: fmt(receivedIso),
      receivedIso,
      nextDue: hasDue ? { state: dueState(dueIso, stage), date: fmt(dueIso), iso: dueIso } : null,
      stage,
      demand: i === 0 ? 45230000 : Math.floor(r() ** 3 * 4_00_00_000) * 100,
      owner: pick(people).name,
      language: pick(languages),
      channel: pick(channels),
    };
  });
}

/* ---------------- Calendar ---------------- */

export const holidays: CalendarHoliday[] = [
  { date: "2026-11-08", name: "Diwali" },
  { date: "2026-11-10", name: "Diwali (Balipratipada)" },
  { date: "2026-11-24", name: "Guru Nanak Jayanti" },
  { date: "2026-12-25", name: "Christmas" },
];

export const calendarEvents: CalendarEvent[] = [
  { id: "e1", date: "2026-11-07", title: "TDS payment (Oct)", state: "done", kind: "statutory" },
  { id: "e2", date: "2026-11-11", title: "GSTR-1 (Oct)", state: "done", kind: "statutory" },
  {
    id: "e3",
    date: "2026-11-12",
    title: "Reply to DRC-01",
    state: "overdue",
    kind: "notice",
    client: "Anand Textiles LLP",
  },
  {
    id: "e4",
    date: "2026-11-13",
    title: "Reply to 148A(b)",
    state: "overdue",
    kind: "notice",
    client: "Lotus Hospitality Ltd",
  },
  {
    id: "e5",
    date: "2026-11-16",
    title: "Reply to REG-17",
    state: "today",
    kind: "notice",
    client: "Kaveri Agro Exports",
  },
  {
    id: "e6",
    date: "2026-11-16",
    title: "Hearing · 142(1)",
    state: "today",
    kind: "hearing",
    time: "15:00",
    client: "Meridian Software Pvt Ltd",
  },
  {
    id: "e7",
    date: "2026-11-20",
    title: "Reply to ASMT-10",
    state: "week",
    kind: "notice",
    client: "Harbour Valley Foods Pvt Ltd",
  },
  { id: "e8", date: "2026-11-20", title: "GSTR-3B (Oct)", state: "week", kind: "statutory" },
  {
    id: "e9",
    date: "2026-11-20",
    title: "Reply to DRC-01A",
    state: "week",
    kind: "notice",
    client: "Zenith Pharma Ltd",
  },
  {
    id: "e10",
    date: "2026-11-20",
    title: "Reply to 143(1)",
    state: "week",
    kind: "notice",
    client: "Sahyadri Constructions",
  },
  {
    id: "e11",
    date: "2026-11-27",
    title: "Hearing · ASMT-10",
    state: "later",
    kind: "hearing",
    time: "11:30",
    client: "Harbour Valley Foods Pvt Ltd",
  },
  { id: "e12", date: "2026-11-30", title: "ITR (audit cases)", state: "later", kind: "statutory" },
  { id: "e13", date: "2026-12-07", title: "TDS payment (Nov)", state: "later", kind: "statutory" },
  { id: "e14", date: "2026-12-15", title: "Advance tax (Q3)", state: "later", kind: "statutory" },
  {
    id: "e15",
    date: "2026-12-04",
    title: "Appeal window closes",
    state: "later",
    kind: "order",
    client: "Northwind Logistics",
  },
];

/* ---------------- Activity, notifications, uploads ---------------- */

export const activity: ActivityItem[] = [
  {
    id: "a1",
    kind: "audit",
    actor: { name: "Dueproof" },
    at: "2026-10-24T10:02:00+05:30",
    time: "24 Oct, 10:02",
    action: "read the notice (2 pages) and found 3 duties",
  },
  {
    id: "a2",
    kind: "ai",
    actor: { name: "Dueproof AI" },
    at: "2026-10-24T10:03:00+05:30",
    time: "24 Oct, 10:03",
    action: "suggested a duty: reverse excess ITC with interest",
    body: "Not located on the page — needs review.",
  },
  {
    id: "a3",
    kind: "history",
    actor: { name: "Rahul Mehta" },
    at: "2026-10-24T11:20:00+05:30",
    time: "24 Oct, 11:20",
    action: "assigned the reply to",
    change: { to: "Ananya Iyer" },
  },
  {
    id: "a4",
    kind: "history",
    actor: { name: "Rahul Mehta" },
    at: "2026-10-24T11:24:00+05:30",
    time: "24 Oct, 11:24",
    action: "corrected the received date",
    change: { from: "24 Oct 2026", to: "21 Oct 2026" },
    reason: "Served on the portal on 21 Oct; the email came later.",
  },
  {
    id: "a5",
    kind: "comment",
    actor: { name: "Ananya Iyer" },
    at: "2026-11-02T16:45:00+05:30",
    time: "2 Nov, 16:45",
    body: "@Rahul Mehta the GSTR-2B mismatch is mostly two suppliers who filed late. I've asked the client for their invoices.",
  },
  {
    id: "a6",
    kind: "history",
    actor: { name: "Ananya Iyer" },
    at: "2026-11-03T09:10:00+05:30",
    time: "3 Nov, 09:10",
    action: "moved the stage",
    change: { from: "Documents gathered", to: "Draft reply" },
  },
  {
    id: "a7",
    kind: "comment",
    actor: { name: "Rahul Mehta" },
    at: "2026-11-14T18:05:00+05:30",
    time: "14 Nov, 18:05",
    body: "Draft looks good. @Priya Sharma can you approve by Wednesday? Due on the 20th.",
  },
];

export const notifications: NotificationItem[] = [
  {
    id: "n1",
    title: "Priya Sharma approved the reply",
    body: "ASMT-10 · Harbour Valley Foods",
    time: "10 min ago",
    tone: "success",
  },
  {
    id: "n2",
    title: "2 notices are overdue",
    body: "Anand Textiles · Lotus Hospitality",
    time: "1 h ago",
    tone: "attention",
  },
  {
    id: "n3",
    title: "Rahul Mehta mentioned you",
    body: "“can you approve by Wednesday?”",
    time: "Yesterday",
    tone: "accent",
  },
  {
    id: "n4",
    title: "New notice from WhatsApp",
    body: "Kaveri Agro Exports sent 3 photos",
    time: "Yesterday",
    read: true,
  },
  {
    id: "n5",
    title: "GSTR-3B (Oct) due in 4 days",
    body: "11 clients",
    time: "2 days ago",
    read: true,
  },
];

export const uploads: UploadItem[] = [
  {
    id: "u1",
    name: "ASMT-10_HarbourValley.pdf",
    size: 412_000,
    stage: "done",
    detail: "2 pages · English",
  },
  {
    id: "u2",
    name: "DRC-01_AnandTextiles_scan.pdf",
    size: 2_840_000,
    stage: "finding",
    detail: "6 pages",
  },
  { id: "u3", name: "IMG_20261114_1022.jpg", size: 3_210_000, stage: "uploading", progress: 0.42 },
  {
    id: "u4",
    name: "26AS_FY2025-26.pdf",
    size: 980_000,
    stage: "needs_password",
    error: "Enter it once; it's used for this read and never stored.",
  },
  {
    id: "u5",
    name: "notice (1).pdf",
    size: 412_000,
    stage: "duplicate",
    detail: "Same as ASMT-10 · Harbour Valley Foods",
  },
  {
    id: "u6",
    name: "order-scan.tiff",
    size: 18_400_000,
    stage: "failed",
    error: "Couldn't read this file. Try a PDF or a JPG.",
  },
];

/* ---------------- Exposure ---------------- */

export const exposure: ExposureRow[] = [
  {
    id: "c1",
    label: "Harbour Valley Foods Pvt Ltd",
    sublabel: "2 open notices",
    tax: 45230000,
    interest: 2190000,
    penalty: { min: 1000000, max: 4523000 },
  },
  {
    id: "c3",
    label: "Zenith Pharma Ltd",
    sublabel: "1 open notice",
    tax: 1284000000,
    interest: 96300000,
    penalty: { min: 128400000, max: 1284000000 },
  },
  {
    id: "c2",
    label: "Anand Textiles LLP",
    sublabel: "3 open notices",
    tax: 18760000,
    interest: 1420000,
    penalty: { min: 1000000, max: 1876000 },
  },
  {
    id: "c7",
    label: "Lotus Hospitality Ltd",
    sublabel: "1 open notice",
    tax: 312500000,
    interest: 30200000,
    penalty: { min: 0, max: 62500000 },
  },
];

/* ---------------- Filters ---------------- */

export const noticeFilters: FilterDefinition[] = [
  {
    id: "client",
    label: "Client",
    icon: ClientIcon,
    options: clients.map((c) => ({ value: c.id, label: c.name })),
  },
  {
    id: "type",
    label: "Type",
    icon: NoticeIcon,
    options: [
      { value: "asmt10", label: "GST · ASMT-10" },
      { value: "drc01", label: "GST · DRC-01" },
      { value: "143", label: "Income tax · 143(1)" },
      { value: "148a", label: "Income tax · 148A(b)" },
    ],
  },
  {
    id: "owner",
    label: "Owner",
    icon: UserIcon,
    options: people.map((p) => ({ value: p.id, label: p.name })),
  },
  {
    id: "due",
    label: "Due",
    icon: CalendarDaysIcon,
    multiple: false,
    options: [
      { value: "overdue", label: "Overdue" },
      { value: "week", label: "This week" },
      { value: "month", label: "This month" },
    ],
  },
];

/* ---------------- Settings ---------------- */

export const settingsSections: SettingsNavItem[] = [
  { id: "me", label: "Me", icon: UserIcon },
  { id: "org", label: "Organisation", icon: OrgIcon },
  { id: "team", label: "Team & access", icon: UsersIcon },
  { id: "ai", label: "AI", icon: AiSuggestedIcon },
  { id: "intake", label: "Intake", icon: WhatsappIntakeIcon },
  { id: "profiles", label: "Profiles", icon: ListChecksIcon },
  { id: "integrations", label: "Integrations", icon: LinkIcon },
  { id: "notifications", label: "Notifications", icon: BellIcon },
  { id: "system", label: "System", icon: MonitorIcon, badge: "Self-hosted" },
];
