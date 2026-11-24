/** Pip centres on a 52×52 face, by value. */
const PIPS: Record<number, ReadonlyArray<readonly [number, number]>> = {
  1: [[26, 26]],
  2: [[15, 15], [37, 37]],
  3: [[15, 15], [26, 26], [37, 37]],
  4: [[15, 15], [37, 15], [15, 37], [37, 37]],
  5: [[15, 15], [37, 15], [26, 26], [15, 37], [37, 37]],
  6: [[15, 14], [37, 14], [15, 26], [37, 26], [15, 38], [37, 38]],
};

/**
 * An ivory die with red pips. The 1 (Perudo's wild "paco") gets a single gold
 * pip so it reads as the joker. `face` null draws a hidden die.
 */
export function Die({ face, className }: { face: number | null; className?: string }) {
  const cls = `die-art${face === null ? " hidden" : ""}${className ? ` ${className}` : ""}`;
  if (face === null) {
    return (
      <svg className={cls} viewBox="0 0 52 52" role="img" aria-label="Dé caché">
        <rect x="2" y="2" width="48" height="48" rx="9" fill="#1f1714" stroke="#c9a55a" strokeWidth="2" />
        <text x="26" y="26" dy="0.35em" textAnchor="middle" fontSize="24" fill="#c9a55a" className="die-art-mark">?</text>
      </svg>
    );
  }
  return (
    <svg className={cls} viewBox="0 0 52 52" role="img" aria-label={face === 1 ? "1 (joker)" : String(face)}>
      <rect x="2" y="2" width="48" height="48" rx="9" fill="#f4ecdc" stroke="#c9a55a" strokeWidth="2" />
      {face === 1
        ? <circle cx="26" cy="26" r="7" fill="#c9a55a" stroke="#8c1426" strokeWidth="1.6" />
        : (PIPS[face] ?? []).map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r="4.4" fill="#8c1426" />)}
    </svg>
  );
}
