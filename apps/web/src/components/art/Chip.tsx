import type { ButtonHTMLAttributes } from "react";

interface ChipTone {
  base: string;
  insert: string;
  text: string;
}

/** Casino colours by denomination: ivory 10, black 50, red 100, green above. */
function toneOf(value: number): ChipTone {
  if (value <= 10) return { base: "#f4ecdc", insert: "#8c1426", text: "#1a1412" };
  if (value <= 50) return { base: "#1f1a18", insert: "#f4ecdc", text: "#f4ecdc" };
  if (value <= 100) return { base: "#7a1222", insert: "#f4ecdc", text: "#f4ecdc" };
  return { base: "#1f4d3a", insert: "#f4ecdc", text: "#f4ecdc" };
}

/** Eight edge inserts around a r=41 ring (circumference ≈ 257.6). */
const INSERTS = "12 20.2";

/**
 * A casino chip seen from above: gold rim, ivory edge inserts, gold inlay.
 * Sized by its container (100 % × 100 %). `label` prints the value in the middle.
 */
export function Chip({ value, label = String(value), className }: { value: number; label?: string | null; className?: string }) {
  const tone = toneOf(value);
  const size = !label ? 0 : label.length <= 2 ? 30 : label.length === 3 ? 25 : 19;
  return (
    <svg className={className ? `chip-art ${className}` : "chip-art"} viewBox="0 0 100 100" aria-hidden>
      <circle cx="50" cy="50" r="48" fill={tone.base} />
      <circle cx="50" cy="50" r="41" fill="none" stroke={tone.insert} strokeWidth="8" strokeDasharray={INSERTS} />
      <circle cx="50" cy="50" r="48" fill="none" stroke="#c9a55a" strokeWidth="2.5" />
      <circle cx="50" cy="50" r="31" fill={tone.base} stroke="#c9a55a" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="27" fill="none" stroke="#c9a55a" strokeWidth="0.8" strokeDasharray="1.5 3" />
      {label && (
        <text x="50" y="50" dy="0.35em" textAnchor="middle" fontSize={size} fill={tone.text} className="chip-art-value">
          {label}
        </text>
      )}
    </svg>
  );
}

/** A chip the player clicks to add a denomination to a bet. */
export function ChipButton({ value, selected, className, ...rest }:
  { value: number; selected?: boolean } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return (
    <button type="button" aria-label={String(value)} aria-pressed={selected} {...rest}
      className={`chip-btn c${value}${selected ? " selected" : ""}${className ? ` ${className}` : ""}`}>
      <Chip value={value} />
    </button>
  );
}

/** One disc of a stack seen from the side (viewBox 80 × 18). */
function StackDisc({ y, tone }: { y: number; tone: ChipTone }) {
  return (
    <g transform={`translate(0 ${y})`}>
      <ellipse cx="40" cy="12" rx="36" ry="7" fill="#000" fillOpacity="0.35" />
      <rect x="4" y="6" width="72" height="6" fill={tone.base} />
      {[16, 37, 58].map((x) => <rect key={x} x={x} y="6" width="6" height="6" fill={tone.insert} />)}
      <ellipse cx="40" cy="6" rx="36" ry="6" fill={tone.base} stroke="#c9a55a" strokeWidth="1" />
    </g>
  );
}

/** The player's bankroll as a small mixed stack (decorative). */
export function ChipStack({ className }: { className?: string }) {
  const tones = [toneOf(100), toneOf(100), toneOf(50), toneOf(50), toneOf(10), toneOf(10)];
  return (
    <svg className={className ? `chip-stack ${className}` : "chip-stack"} viewBox="0 0 80 64" aria-hidden>
      {tones.map((tone, i) => <StackDisc key={i} y={44 - i * 8} tone={tone} />)}
    </svg>
  );
}
