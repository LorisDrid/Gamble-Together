/** The lacquered dice cup a Liar's Dice player hides their dice under. */
export function Cup({ className }: { className?: string }) {
  return (
    <svg className={className ? `cup-art ${className}` : "cup-art"} viewBox="0 0 60 64" aria-hidden>
      <path d="M10 6h40l-6 54H16L10 6z" fill="#1a1412" stroke="#c9a55a" strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 18h36M14.5 46h31" stroke="#c9a55a" strokeWidth="1.5" />
      <path d="M30 24l6 8-6 8-6-8z" fill="none" stroke="#c9a55a" strokeWidth="1.5" />
    </svg>
  );
}
