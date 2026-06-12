import type { Card } from "@gamble/shared";

const SUIT_SYMBOLS: Record<Card["suit"], string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

interface PlayingCardProps {
  card: Card;
  /** Position in the hand — staggers the deal-in so cards arrive one by one. */
  index?: number;
  /** Use the flip-reveal animation (dealer's hole card turning over). */
  flip?: boolean;
}

export function PlayingCard({ card, index = 0, flip = false }: PlayingCardProps) {
  const red = card.suit === "hearts" || card.suit === "diamonds";
  const className = `pcard${red ? " red" : ""}${flip ? " flip" : ""}`;
  // Flip cards reveal in place; dealt cards cascade with a per-index delay.
  const style = flip ? undefined : { animationDelay: `${index * 0.13}s` };
  return (
    <span className={className} style={style}>
      <span className="pcard-rank">{card.rank}</span>
      <span className="pcard-suit">{SUIT_SYMBOLS[card.suit]}</span>
    </span>
  );
}

export function CardBack({ index = 0 }: { index?: number }) {
  return <span className="pcard back" style={{ animationDelay: `${index * 0.13}s` }} aria-hidden />;
}
