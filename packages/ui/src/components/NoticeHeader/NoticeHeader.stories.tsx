import { ApprovalIcon, PrintIcon } from "@dueproof/icons";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { harbour } from "../../stories/fixtures";
import { AIBadge } from "../AIBadge/AIBadge";
import { Button } from "../Button/Button";
import { LanguageIndicator } from "../LanguageIndicator/LanguageIndicator";
import { NoticeHeader } from "./NoticeHeader";

const meta = {
  title: "Dueproof/NoticeHeader",
  component: NoticeHeader,
  args: {
    authority: "gst",
    type: "GST · ASMT-10 · Scrutiny of returns",
    reference: "ZD2710260012345",
    din: "DIN 20261021MH000000A7F3",
    issuingOffice: "Superintendent, CGST Range IV, Division Andheri, Mumbai East",
    amount: 45230000,
    sections: ["Section 61", "Rule 99"],
    received: "21 Oct 2026",
    onEditReceived: () => {},
    onShowReceivedHistory: () => {},
    client: { name: harbour.name, identifier: harbour.gstin, href: "#client" },
    owner: { name: "Ananya Iyer" },
    stage: "drafting",
    actions: (
      <>
        <Button icon={PrintIcon}>Evidence report</Button>
        <Button variant="primary" icon={ApprovalIcon}>
          Ask for approval
        </Button>
      </>
    ),
  },
} satisfies Meta<typeof NoticeHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CorrectedAndTranslated: Story = {
  args: {
    receivedCorrected: true,
    badges: (
      <>
        <LanguageIndicator language="Marathi" onShowOriginal={() => {}} size="sm" />
        <AIBadge state="suggested" size="sm" />
      </>
    ),
  },
};

export const IncomeTaxUnassigned: Story = {
  render: () => (
    <NoticeHeader
      authority="income-tax"
      type="Income tax · Section 148A(b) · Show cause"
      reference="ITBA/AST/F/148A/2026-27/1067845123(1)"
      issuingOffice="Income Tax Officer, Ward 3(2)(1), Mumbai"
      sections={["148A(b)", "147"]}
      received="9 Nov 2026"
      client={{ name: "Lotus Hospitality Ltd", identifier: "AABCL6789L" }}
      stage="received"
    />
  ),
};
