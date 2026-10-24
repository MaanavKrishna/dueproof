/** A register page: the red margin, ruled lines, one line outlined as proof. */
export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2.5" y="2.5" width="19" height="19" rx="2.5" fill="#fff" stroke="#e8ad2e" strokeWidth="1.6" />
      <path d="M7.5 3v18" stroke="#c7362b" strokeWidth="1.2" />
      <path d="M10 8h8M10 16h8" stroke="#a9c4b8" strokeWidth="1.2" />
      <rect x="9" y="10" width="10" height="4" rx="1" fill="none" stroke="#c98d12" strokeWidth="1.6" />
    </svg>
  );
}
