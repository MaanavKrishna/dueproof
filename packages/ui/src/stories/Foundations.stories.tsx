import * as icons from "@dueproof/icons";
import { BRANDS, type BrandName, brandLabels, typeStyles, vars } from "@dueproof/tokens";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../components/Button/Button";
import { DueChip } from "../components/DueChip/DueChip";
import { ThemeScope } from "../components/Provider/UIProvider";
import { StatusPill } from "../components/StatusPill/StatusPill";
import { Card, Row, Section, Stack } from "./helpers";

const meta = { title: "Foundations/Overview" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function Swatch({ name, value, fg }: { name: string; value: string; fg?: string }) {
  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: "var(--dp-space-4)", width: "120px" }}
    >
      <div
        style={{
          height: "var(--dp-space-48)",
          borderRadius: "var(--dp-radius-md)",
          background: value,
          boxShadow: "inset 0 0 0 1px var(--dp-separator-default)",
          display: "grid",
          placeItems: "center",
          color: fg,
          font: "var(--dp-text-headline-font)",
        }}
      >
        {fg ? "Aa" : null}
      </div>
      <span style={{ font: "var(--dp-text-mono-font)", color: "var(--dp-fg-secondary)" }}>
        {name}
      </span>
    </div>
  );
}

export const Colours: Story = {
  render: () => (
    <>
      <Section title="Labels (four levels)">
        <Row>
          <Swatch name="fg.primary" value={vars.bg.surface} fg={vars.fg.primary} />
          <Swatch name="fg.secondary" value={vars.bg.surface} fg={vars.fg.secondary} />
          <Swatch name="fg.tertiary" value={vars.bg.surface} fg={vars.fg.tertiary} />
          <Swatch name="fg.quaternary" value={vars.bg.surface} fg={vars.fg.quaternary} />
        </Row>
      </Section>
      <Section title="Backgrounds">
        <Row>
          <Swatch name="bg.canvas" value={vars.bg.canvas} />
          <Swatch name="bg.surface" value={vars.bg.surface} />
          <Swatch name="bg.elevated" value={vars.bg.elevated} />
          <Swatch name="bg.sunken" value={vars.bg.sunken} />
          <Swatch name="bg.page" value={vars.bg.page} fg={vars.fg.page} />
        </Row>
      </Section>
      <Section title="Signature and proof (current brand)">
        <Row>
          <Swatch name="accent.solid" value={vars.accent.solid} fg={vars.accent.onSolid} />
          <Swatch name="accent.subtle" value={vars.accent.subtle} fg={vars.accent.subtleFg} />
          <Swatch name="proof.highlight" value={vars.proof.highlight} fg={vars.fg.page} />
          <Swatch name="proof.bg" value={vars.proof.bg} fg={vars.proof.fg} />
        </Row>
      </Section>
      <Section title="Due ladder">
        <Row>
          {(["overdue", "today", "week", "later", "done"] as const).map((d) => (
            <Swatch key={d} name={`due.${d}`} value={vars.due[d].bg} fg={vars.due[d].fg} />
          ))}
        </Row>
      </Section>
      <Section title="Feedback">
        <Row>
          {(["danger", "warning", "success", "info"] as const).map((t) => (
            <Swatch
              key={t}
              name={`feedback.${t}`}
              value={vars.feedback[t].bg}
              fg={vars.feedback[t].fg}
            />
          ))}
        </Row>
      </Section>
      <Section title="Data (categorical)">
        <Row>
          {(["1", "2", "3", "4", "5", "6", "7", "8"] as const).map((n) => (
            <Swatch key={n} name={`data.${n}`} value={vars.data[n]} />
          ))}
        </Row>
      </Section>
    </>
  ),
};

function BrandPreview({ brand }: { brand: BrandName }) {
  return (
    <ThemeScope
      brand={brand}
      style={{ padding: "var(--dp-space-24)", borderRadius: "var(--dp-radius-xl)" }}
    >
      <Stack gap={12}>
        <span
          style={{
            font: "var(--dp-text-overline-font)",
            letterSpacing: "var(--dp-text-overline-tracking)",
            textTransform: "uppercase",
            color: "var(--dp-fg-tertiary)",
          }}
        >
          {brandLabels[brand]}
        </span>
        <span style={{ font: "var(--dp-text-title1-font)" }}>Reply due 20 Nov 2026</span>
        <Card>
          <p style={{ margin: 0, font: "var(--dp-text-reading-font)", color: "var(--dp-fg-page)" }}>
            You are required to file a reply{" "}
            <mark
              style={{
                background: vars.proof.highlight,
                color: "inherit",
                boxShadow: `0 0 0 1px ${vars.proof.stroke}`,
                borderRadius: "var(--dp-radius-xs)",
              }}
            >
              within thirty days of receipt of this notice
            </mark>
            , failing which…
          </p>
        </Card>
        <Row>
          <Button variant="primary">Mark as replied</Button>
          <Button>Assign</Button>
          <DueChip state="week" detail="Fri 20 Nov" />
          <StatusPill label="In review" tone="accent" />
        </Row>
      </Stack>
    </ThemeScope>
  );
}

/** The three colour directions (02 §4) side by side. Switch the theme in the toolbar. */
export const BrandDirections: Story = {
  render: () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
        gap: "var(--dp-space-24)",
      }}
    >
      {BRANDS.map((b) => (
        <BrandPreview key={b} brand={b} />
      ))}
    </div>
  ),
};

export const Typography: Story = {
  render: () => (
    <Stack gap={12}>
      {Object.entries(typeStyles).map(([name, s]) => {
        const kebab = name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
        return (
          <div
            key={name}
            style={{ display: "flex", alignItems: "baseline", gap: "var(--dp-space-24)" }}
          >
            <span
              style={{
                width: "160px",
                flex: "none",
                font: "var(--dp-text-mono-font)",
                color: "var(--dp-fg-tertiary)",
              }}
            >
              {name} · {s.size}/{s.line}
            </span>
            <span
              style={{
                font: `var(--dp-text-${kebab}-font)`,
                letterSpacing: `var(--dp-text-${kebab}-tracking)`,
                textTransform: name === "overline" ? "uppercase" : undefined,
              }}
            >
              {name === "mono" ? "07AAACA1234F1Z5 · s.73(1)" : "Reply due 20 Nov 2026 — ₹4,52,300"}
            </span>
          </div>
        );
      })}
    </Stack>
  ),
};

export const Icons: Story = {
  render: () => {
    const all = Object.entries(icons).filter(([n]) => /^[A-Z]\w*Icon$/.test(n)) as [
      string,
      icons.Icon,
    ][];
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: "var(--dp-space-8)",
        }}
      >
        {all.map(([name, IconComponent]) => (
          <div
            key={name}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "var(--dp-space-8)",
              padding: "var(--dp-space-12)",
              borderRadius: "var(--dp-radius-md)",
              background: "var(--dp-bg-surface)",
            }}
          >
            <IconComponent size={24} />
            <span style={{ font: "var(--dp-text-caption-font)", color: "var(--dp-fg-secondary)" }}>
              {name.replace(/Icon$/, "")}
            </span>
          </div>
        ))}
      </div>
    );
  },
};

export const Elevation: Story = {
  render: () => (
    <Row gap={32}>
      {(["1", "2", "3", "page"] as const).map((n) => (
        <div
          key={n}
          style={{
            width: "160px",
            height: "100px",
            display: "grid",
            placeItems: "center",
            borderRadius: "var(--dp-radius-lg)",
            background: "var(--dp-bg-surface)",
            boxShadow: `var(--dp-shadow-${n})`,
            font: "var(--dp-text-mono-font)",
          }}
        >
          shadow.{n}
        </div>
      ))}
      <div
        style={{
          width: "200px",
          height: "100px",
          display: "grid",
          placeItems: "center",
          borderRadius: "var(--dp-radius-lg)",
          background: "var(--dp-material-regular)",
          backdropFilter: "var(--dp-blur-material)",
          boxShadow: "var(--dp-shadow-2)",
          font: "var(--dp-text-mono-font)",
        }}
      >
        material.regular
      </div>
    </Row>
  ),
};
