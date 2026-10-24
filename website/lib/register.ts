// The sample register on the home page. Every notice is fictional; the GST
// notice is tests/fixtures/notice-gst-asmt10.pdf word for word, and its
// entries are what Dueproof extracts from it.

export type Segment = string | { proof: string };

export type Entry = {
  no: number;
  received: string;          // as shown in the register
  from: string;
  subject: string;
  desk: string;
  due: string;
  basis: string;             // how the date was arrived at
  duty: string;              // the finding, in English
  amount?: string;
  translated?: boolean;      // the page is not in English
  page: {
    lang?: string;
    head: string[];
    body: Segment[][];       // paragraphs; one segment is the proof
  };
};

const gstHead = [
  "Office of the Assistant Commissioner of State Tax",
  "Commercial Taxes Department, Northline Division",
  "Reference No: ZD2910260012345    Date: 20 October 2026",
];
const gstOpening: Segment[][] = [
  ["Subject: Notice under Section 61 for intimating discrepancies in the return (Form GST ASMT-10)"],
  ["On scrutiny of the returns filed for the above period, discrepancies were noticed in the input tax credit claimed against the supplier statements."],
];

export const ENTRIES: Entry[] = [
  {
    no: 215,
    received: "14 Oct 2026",
    from: "Regional PF Commissioner",
    subject: "Summons under section 7A",
    desk: "Payroll & Labour",
    due: "12 Nov 2026",
    basis: "Date written in the notice, 11:00 AM",
    duty: "Appear at the office with all records on 12 November 2026 at 11:00 AM.",
    translated: true,
    page: {
      lang: "hi",
      head: ["कर्मचारी भविष्य निधि संगठन", "क्षेत्रीय कार्यालय, नॉर्थलाइन", "संदर्भ: NL/7A/2026/0412    दिनांक: 10 अक्टूबर 2026"],
      body: [
        ["विषय: कर्मचारी भविष्य निधि एवं प्रकीर्ण उपबंध अधिनियम, 1952 की धारा 7A के अंतर्गत समन"],
        ["प्रति: हार्बर वैली कंपोनेंट्स प्रा. लि."],
        [{ proof: "आपको निर्देश दिया जाता है कि 12 नवंबर 2026 को प्रातः 11:00 बजे सभी अभिलेखों सहित इस कार्यालय में उपस्थित हों।" }],
      ],
    },
  },
  {
    no: 216,
    received: "20 Oct 2026",
    from: "National Faceless Assessment Centre",
    subject: "Notice under section 143(2), AY 2025-26",
    desk: "Direct Tax",
    due: "4 Nov 2026",
    basis: "“On or before 4 November 2026”",
    duty: "Furnish the documents listed in the annexure through the e-filing portal.",
    page: {
      head: ["Income Tax Department", "National Faceless Assessment Centre", "Date: 18 October 2026"],
      body: [
        ["To: Harbour Valley Components Pvt Ltd, Assessment Year 2025-26."],
        ["Your return of income for the above year has been selected for scrutiny."],
        [{ proof: "You are requested to furnish the documents listed in the annexure through the e-filing portal on or before 4 November 2026." }],
      ],
    },
  },
  {
    no: 217,
    received: "24 Oct 2026",
    from: "Asst. Commissioner of State Tax",
    subject: "GST ASMT-10, input tax credit",
    desk: "GST & Indirect Tax",
    due: "23 Nov 2026",
    basis: "30 days from receipt on 24 Oct 2026",
    duty: "Explain the discrepancies and pay the tax with interest.",
    amount: "₹4,52,300",
    page: {
      head: gstHead,
      body: [
        ...gstOpening,
        [{ proof: "You are hereby directed to explain the discrepancies and pay the tax of Rs. 4,52,300 with interest within 30 days of receipt of this notice." }],
        ["A personal hearing is fixed on 18 November 2026 at 11:00 AM before the undersigned at the Division office."],
      ],
    },
  },
  {
    no: 218,
    received: "24 Oct 2026",
    from: "Asst. Commissioner of State Tax",
    subject: "GST ASMT-10, personal hearing",
    desk: "GST & Indirect Tax",
    due: "18 Nov 2026",
    basis: "Hearing date written in the notice, 11:00 AM",
    duty: "Attend the personal hearing at the Division office.",
    page: {
      head: gstHead,
      body: [
        ...gstOpening,
        ["You are hereby directed to explain the discrepancies and pay the tax of Rs. 4,52,300 with interest within 30 days of receipt of this notice."],
        [{ proof: "A personal hearing is fixed on 18 November 2026 at 11:00 AM before the undersigned at the Division office." }],
      ],
    },
  },
];
