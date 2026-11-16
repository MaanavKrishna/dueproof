import {
  ApprovalIcon,
  ArrowLeftIcon,
  FiledAckIcon,
  HearingIcon,
  HearingPackIcon,
  MoreIcon,
  NoticeIcon,
  PrintIcon,
  ProofIcon,
  ReceiptIcon,
} from "@dueproof/icons";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ActivityFeed } from "../components/ActivityFeed/ActivityFeed";
import { Amount } from "../components/Amount/Amount";
import { Banner } from "../components/Banner/Banner";
import { Breadcrumbs } from "../components/Breadcrumbs/Breadcrumbs";
import { Button } from "../components/Button/Button";
import { CommentComposer } from "../components/CommentComposer/CommentComposer";
import { FindingCard } from "../components/FindingCard/FindingCard";
import { IconButton } from "../components/IconButton/IconButton";
import { LanguageIndicator } from "../components/LanguageIndicator/LanguageIndicator";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "../components/Menu/Menu";
import { NoticeHeader } from "../components/NoticeHeader/NoticeHeader";
import { ProofViewer } from "../components/ProofViewer/ProofViewer";
import { StageStepper } from "../components/StageStepper/StageStepper";
import { Timeline } from "../components/Timeline/Timeline";
import { Workings } from "../components/Workings/Workings";
import {
  activity,
  asmt10Findings,
  asmt10Highlights,
  asmt10Pages,
  asmt10PagesHindi,
  harbour,
  people,
} from "../stories/fixtures";
import { DemoShell } from "../stories/shell";
import { DetailPageTemplate } from "./DetailPageTemplate";

const meta: Meta<typeof DetailPageTemplate> = {
  title: "Templates/Detail page",
  component: DetailPageTemplate,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof DetailPageTemplate>;

function CasePageView({
  translated = false,
  proofOpen = true,
}: {
  translated?: boolean;
  proofOpen?: boolean;
}) {
  const [active, setActive] = useState<string | null>("h-due");
  const [inspectorOpen, setInspectorOpen] = useState(proofOpen);
  const show = (id: string) => {
    setActive(id);
    setInspectorOpen(true);
  };
  const findings = (
    <>
      {translated ? (
        <LanguageIndicator
          language="Hindi"
          onShowOriginal={() => show("h-due")}
          detail="Machine translation"
        />
      ) : null}
      {asmt10Findings.map((f) => (
        <FindingCard
          key={f.id}
          duty={f.duty}
          {...(f.due ? { due: f.due } : {})}
          basis={f.basis}
          {...(f.owner ? { owner: f.owner } : {})}
          status={f.status}
          origin={f.origin}
          verification={f.verification}
          grade={f.grade}
          {...(f.quote ? { quote: f.quote } : {})}
          sourceLabel={f.verification.page ? `Page ${f.verification.page}` : "Expected on page 1"}
          selected={inspectorOpen && active === f.highlightId}
          onShowSource={() => show(f.highlightId)}
          needsReview={f.needsReview ?? false}
          reviewReason={f.reviewReason}
          onConfirm={() => {}}
          onEdit={() => {}}
          onDismiss={() => {}}
        />
      ))}
    </>
  );
  return (
    <DemoShell active="notices">
      <DetailPageTemplate
        title="ASMT-10 · ZD2710260012345"
        toolbarLeading={<IconButton icon={ArrowLeftIcon} label="Back to notices" />}
        breadcrumbs={
          <Breadcrumbs
            items={[
              { id: "notices", label: "Notices", href: "#" },
              { id: "client", label: harbour.name, href: "#" },
              { id: "case", label: "ZD2710260012345" },
            ]}
          />
        }
        actions={
          <>
            <Button icon={ProofIcon} onClick={() => setInspectorOpen(!inspectorOpen)}>
              {inspectorOpen ? "Hide page" : "Show page"}
            </Button>
            <Menu>
              <MenuTrigger>
                <IconButton icon={MoreIcon} label="More actions" />
              </MenuTrigger>
              <MenuContent align="end">
                <MenuItem icon={PrintIcon}>Print evidence report</MenuItem>
                <MenuItem icon={HearingPackIcon}>Hearing pack</MenuItem>
                <MenuItem icon={HearingIcon}>Reschedule hearing</MenuItem>
              </MenuContent>
            </Menu>
          </>
        }
        header={
          <NoticeHeader
            authority="gst"
            type="GST · ASMT-10 · Scrutiny of returns · FY 2025–26"
            reference="ZD2710260012345"
            din="DIN 20261021MH000000A7F3"
            issuingOffice="Superintendent, CGST Range IV, Division Andheri, Mumbai East"
            amount={45230000}
            sections={["Section 61", "Rule 99"]}
            received="21 Oct 2026"
            receivedCorrected
            onEditReceived={() => {}}
            onShowReceivedHistory={() => {}}
            client={{ name: harbour.name, identifier: harbour.gstin, href: "#client" }}
            owner={{ name: "Ananya Iyer" }}
            stage="drafting"
            actions={
              <Button variant="primary" icon={ApprovalIcon}>
                Ask for approval
              </Button>
            }
          />
        }
        stageBar={
          <StageStepper
            current="drafting"
            details={{ received: "21 Oct", gathering: "2 Nov", drafting: "Ananya Iyer" }}
            onStageSelect={() => {}}
          />
        }
        banner={
          <Banner tone="info" title="Reply due in 4 days.">
            Priya Sharma approves replies for this client.
          </Banner>
        }
        tabs={[
          { id: "duties", label: "What must happen", count: 3, content: findings },
          {
            id: "thread",
            label: "Thread",
            count: 2,
            content: (
              <Timeline
                aria-label="Case thread"
                items={[
                  {
                    id: "t1",
                    title: "ASMT-10 notice",
                    time: "21 Oct 2026 · 2 pages",
                    icon: NoticeIcon,
                    tone: "proof",
                    meta: (
                      <Button size="sm" variant="plain" onClick={() => show("h-due")}>
                        Open
                      </Button>
                    ),
                  },
                  {
                    id: "t2",
                    title: "Supplier invoices (14)",
                    time: "2 Nov 2026",
                    icon: ReceiptIcon,
                  },
                  {
                    id: "t3",
                    title: "Reply and acknowledgement",
                    icon: FiledAckIcon,
                    status: "upcoming",
                    description: "Upload the ARN acknowledgement when filed",
                  },
                ]}
              />
            ),
          },
          {
            id: "demand",
            label: "Demand and interest",
            content: (
              <Workings
                title="Interest on excess ITC to 16 Nov 2026"
                rateSource="Rate from the India pack (GST s. 50(3)), last checked 1 Oct 2026 — verify."
                onEditInputs={() => {}}
                steps={[
                  {
                    id: "s1",
                    label: "Tax demanded",
                    inputs: [
                      {
                        label: "Total tax",
                        value: <Amount minor={45230000} />,
                        source: "From the notice, page 1",
                      },
                    ],
                    result: <Amount minor={45230000} />,
                  },
                  {
                    id: "s2",
                    label: "Interest under section 50(3) on excess ITC",
                    formula: "₹3,18,400 × 18% × 545 days ÷ 365",
                    result: <Amount minor={8557150} estimate />,
                  },
                ]}
                total={{
                  label: "Interest to date",
                  value: <Amount minor={8557150} size="lg" estimate />,
                }}
              />
            ),
          },
          {
            id: "activity",
            label: "Activity",
            count: 7,
            content: (
              <ActivityFeed
                items={activity}
                composer={
                  <CommentComposer
                    users={people}
                    onSubmit={() => {}}
                    author={{ id: "u1", name: "Priya Sharma" }}
                  />
                }
              />
            ),
          },
        ]}
        inspector={
          <ProofViewer
            title="ASMT-10 · Harbour Valley Foods"
            pages={translated ? asmt10PagesHindi : asmt10Pages}
            highlights={asmt10Highlights}
            activeHighlightId={active}
            onActiveHighlightChange={setActive}
            {...(translated
              ? { languages: { original: "Hindi", translation: "English" }, defaultShowText: true }
              : {})}
          />
        }
        inspectorTitle="The page"
        inspectorOpen={inspectorOpen}
        onInspectorOpenChange={setInspectorOpen}
      />
    </DemoShell>
  );
}

/** The case page: header, stage bar, duties with proof, thread, demand, activity, and the page beside it. */
export const CasePage: Story = { name: "Case page", render: () => <CasePageView /> };

export const CasePageTranslated: Story = {
  name: "Case page (translated)",
  render: () => <CasePageView translated />,
};

export const CasePageWithoutInspector: Story = {
  name: "Case page (page hidden)",
  render: () => <CasePageView proofOpen={false} />,
};
