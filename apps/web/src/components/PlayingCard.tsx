import type { Card } from "@gamble/shared";

const SUIT_SYMBOLS: Record<Card["suit"], string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

export function PlayingCard({ card }: { card: Card }) {
  const red = card.suit === "hearts" || card.suit === "diamonds";
  return (
    <span className={red ? "card-face red" : "card-face"}>
      {card.rank}
      {SUIT_SYMBOLS[card.suit]}
    </span>
  );
}

export function CardBack() {
  return <span className="card-face back">🂠</span>;
}
