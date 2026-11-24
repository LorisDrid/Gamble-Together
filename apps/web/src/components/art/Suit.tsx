import type { Card } from "@gamble/shared";

/** Suit outlines on a 100×100 grid, drawn once so every OS renders the same shape. */
export const SUIT_PATHS: Record<Card["suit"], string> = {
  spades:
    "M50 6C68 28 94 44 94 62C94 76 83 84 72 84C64 84 57 80 54 74C55 84 59 90 66 96H34C41 90 45 84 46 74C43 80 36 84 28 84C17 84 6 76 6 62C6 44 32 28 50 6Z",
  hearts:
    "M50 90C20 68 6 52 6 33C6 19 17 9 30 9C40 9 46 15 50 23C54 15 60 9 70 9C83 9 94 19 94 33C94 52 80 68 50 90Z",
  diamonds: "M50 4L86 50L50 96L14 50Z",
  clubs:
    "M50 8a19 19 0 1 1 0 38a19 19 0 1 1 0-38Z M28 40a19 19 0 1 1 0 38a19 19 0 1 1 0-38Z M72 40a19 19 0 1 1 0 38a19 19 0 1 1 0-38Z M46 56C46 78 42 88 34 96H66C58 88 54 78 54 56Z",
};

/** A suit sized by the surrounding font (1em), filled with the current text colour. */
export function SuitIcon({ suit, className }: { suit: Card["suit"]; className?: string }) {
  return (
    <svg className={className ? `suit-icon ${className}` : "suit-icon"} viewBox="0 0 100 100" aria-hidden>
      <path d={SUIT_PATHS[suit]} fill="currentColor" />
    </svg>
  );
}
