/** A register page: the red margin, ruled lines, one line highlighted as proof. */
export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2.5" y="2.5" width="19" height="19" rx="3" fill="#fff" />
      <path d="M7.5 3v18" stroke="#e5484d" strokeWidth="1.3" />
      <path d="M10 7.5h8M10 16.5h8" stroke="#b9bde0" strokeWidth="1.3" />
      <rect x="9" y="10" width="10" height="4" rx="1" fill="#ffd84d" stroke="#d9ae00" strokeWidth="1" />
    </svg>
  );
}
