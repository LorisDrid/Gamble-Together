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
    <span className={red ? "pcard red" : "pcard"}>
      <span className="pcard-rank">{card.rank}</span>
      <span className="pcard-suit">{SUIT_SYMBOLS[card.suit]}</span>
    </span>
  );
}

export function CardBack() {
  return <span className="pcard back" aria-hidden />;
}
