import type { CSSProperties, ReactNode } from "react";

/** Layout helpers for stories only (not exported from the package). */
export function Row({
  children,
  gap = 12,
  wrap = true,
}: {
  children: ReactNode;
  gap?: number;
  wrap?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: `var(--dp-space-${gap})`,
        flexWrap: wrap ? "wrap" : "nowrap",
      }}
    >
      {children}
    </div>
  );
}

export function Stack({
  children,
  gap = 16,
  width,
}: {
  children: ReactNode;
  gap?: number;
  width?: string;
}) {
  const style: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: `var(--dp-space-${gap})`,
  };
  if (width) style.maxWidth = width;
  return <div style={style}>{children}</div>;
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--dp-space-12)",
        marginBottom: "var(--dp-space-32)",
      }}
    >
      <h3
        style={{
          margin: 0,
          font: "var(--dp-text-overline-font)",
          letterSpacing: "var(--dp-text-overline-tracking)",
          textTransform: "uppercase",
          color: "var(--dp-fg-tertiary)",
        }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

/** A white card on the canvas, like an inset grouped list cell. */
export function Card({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: "var(--dp-space-20)",
        borderRadius: "var(--dp-radius-lg)",
        background: "var(--dp-bg-surface)",
        boxShadow: "var(--dp-shadow-1)",
      }}
    >
      {children}
    </div>
  );
}
