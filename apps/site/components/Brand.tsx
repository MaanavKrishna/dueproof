/**
 * The Dueproof mark (02 §3): a page with a turned corner, a highlight stroke
 * (proof) and a tick (done). Drawn with the brand tokens, so it follows them.
 */
export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M4 3.5A1.5 1.5 0 0 1 5.5 2h9.4L20 7.1v13.4a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 20.5z"
        style={{ fill: "var(--dp-accent-solid)" }}
      />
      <path d="M14.9 2v3.6a1.5 1.5 0 0 0 1.5 1.5H20z" style={{ fill: "var(--dp-accent-subtle)" }} />
      <rect
        x="6.5"
        y="10"
        width="11"
        height="4"
        rx="1"
        style={{ fill: "var(--dp-proof-highlight)" }}
      />
      <path
        d="M8 17.6l1.9 1.9 3.9-4"
        fill="none"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ stroke: "var(--dp-accent-on-solid)" }}
      />
    </svg>
  );
}

export function Wordmark() {
  return (
    <>
      <Mark size={26} />
      <span>Dueproof</span>
    </>
  );
}
