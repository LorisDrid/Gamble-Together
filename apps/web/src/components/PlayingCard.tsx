import type { Card, PresidentCard } from "@gamble/shared";
import type { ReactNode } from "react";

export type DisplayCard = Card | PresidentCard | { kind: "joker"; id: 0 | 1 };

export function displayCardId(card: DisplayCard): string {
  return "suit" in card ? `${card.rank}-${card.suit}` : `joker-${card.id}`;
}

export function displayCardLabel(card: DisplayCard): string {
  const names = { hearts: "cœur", diamonds: "carreau", clubs: "trèfle", spades: "pique" };
  return "suit" in card ? `${card.rank} de ${names[card.suit]}` : "Joker";
}

const SUIT_SYMBOLS: Record<Card["suit"], string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

interface PlayingCardProps {
  card: DisplayCard;
  /** A skin may provide an image without changing game rules or layout. */
  artwork?: ReactNode;
  /** Position in the hand — staggers the deal-in so cards arrive one by one. */
  index?: number;
  /** Use the flip-reveal animation (dealer's hole card turning over). */
  flip?: boolean;
  /** Sabotage mode: highlight a procced "Valet Saboteur". */
  special?: boolean;
}

export function PlayingCard({ card, index = 0, flip = false, special = false, artwork }: PlayingCardProps) {
  const normal = "suit" in card ? card : null;
  const red = normal?.suit === "hearts" || normal?.suit === "diamonds";
  const rank = normal?.rank ?? "★";
  const suit = normal ? SUIT_SYMBOLS[normal.suit] : "JOKER";
  const className = `pcard${red ? " red" : ""}${flip ? " flip" : ""}${special ? " special" : ""}${normal ? "" : " joker"}`;
  // Flip cards reveal in place; dealt cards cascade with a per-index delay.
  const style = flip ? undefined : { animationDelay: `${index * 0.13}s` };
  return (
    <span className={className} style={style} role="img" aria-label={displayCardLabel(card)}>
      <span className="pcard-corner"><span>{rank}</span><small>{normal ? suit : ""}</small></span>
      <span className="pcard-artwork" aria-hidden>{artwork ?? suit}</span>
      <span className="pcard-corner inverse" aria-hidden><span>{rank}</span><small>{normal ? suit : ""}</small></span>
      {special && <span className="pcard-spark" aria-hidden>🗡️</span>}
    </span>
  );
}

export function CardBack({ index = 0 }: { index?: number }) {
  return <span className="pcard back" style={{ animationDelay: `${index * 0.13}s` }} aria-hidden />;
}
