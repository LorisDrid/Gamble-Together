import type { Card, PresidentCard } from "@gamble/shared";
import type { ReactNode } from "react";

import { ICON_SHAPES, Icon, type IconName } from "./art/Icon";
import { SUIT_PATHS, SuitIcon } from "./art/Suit";

export type DisplayCard = Card | PresidentCard | { kind: "joker"; id: 0 | 1 };

export function displayCardId(card: DisplayCard): string {
  return "suit" in card ? `${card.rank}-${card.suit}` : `joker-${card.id}`;
}

export function displayCardLabel(card: DisplayCard): string {
  const names = { hearts: "cœur", diamonds: "carreau", clubs: "trèfle", spades: "pique" };
  return "suit" in card ? `${card.rank} de ${names[card.suit]}` : "Joker";
}

/** Court cards carry the same emblem as their Sabotage power: sword, tiara, crown. */
const COURT_EMBLEM: Partial<Record<Card["rank"], IconName>> = { J: "sword", Q: "tiara", K: "crown" };

/** Placeholder court figure: a gold-framed emblem above the suit (until illustrated). */
function CourtArt({ suit, emblem }: { suit: Card["suit"]; emblem: IconName }) {
  return (
    <svg className="pcard-court" viewBox="0 0 48 60" aria-hidden>
      <rect x="3" y="3" width="42" height="54" rx="5" fill="#c9a55a" fillOpacity="0.1" stroke="#c9a55a" strokeWidth="1.2" />
      <g transform="translate(12 7)" fill="#c9a55a" fillOpacity="0.2" stroke="#a8843d" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round">
        {ICON_SHAPES[emblem]}
      </g>
      <path d={SUIT_PATHS[suit]} transform="translate(14 31) scale(0.2)" fill="currentColor" />
    </svg>
  );
}

/** The ace: its suit inside a double gold ring. */
function AceArt({ suit }: { suit: Card["suit"] }) {
  return (
    <svg className="pcard-ace" viewBox="0 0 100 100" aria-hidden>
      <circle cx="50" cy="50" r="46" fill="none" stroke="#c9a55a" strokeWidth="3" />
      <circle cx="50" cy="50" r="39" fill="none" stroke="#c9a55a" strokeWidth="1.2" strokeDasharray="2 4" />
      <path d={SUIT_PATHS[suit]} transform="translate(24 24) scale(0.52)" fill="currentColor" />
    </svg>
  );
}

function centerArt(card: Card | PresidentCard): ReactNode {
  const emblem = COURT_EMBLEM[card.rank];
  if (emblem) return <CourtArt suit={card.suit} emblem={emblem} />;
  if (card.rank === "A") return <AceArt suit={card.suit} />;
  return <SuitIcon suit={card.suit} />;
}

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
  const className = `pcard${red ? " red" : ""}${flip ? " flip" : ""}${special ? " special" : ""}${normal ? "" : " joker"}`;
  // Flip cards reveal in place; dealt cards cascade with a per-index delay.
  const style = flip ? undefined : { animationDelay: `${index * 0.13}s` };
  const corner = normal
    ? <><span>{normal.rank}</span><small><SuitIcon suit={normal.suit} /></small></>
    : <><span><Icon name="star" /></span><small /></>;
  return (
    <span className={className} style={style} role="img" aria-label={displayCardLabel(card)}>
      <span className="pcard-corner">{corner}</span>
      <span className="pcard-artwork" aria-hidden>
        {artwork ?? (normal ? centerArt(normal) : <span className="pcard-joker">JOKER</span>)}
      </span>
      <span className="pcard-corner inverse" aria-hidden>{corner}</span>
      {special && <span className="pcard-spark" aria-hidden><Icon name="sword" /></span>}
    </span>
  );
}

export function CardBack({ index = 0 }: { index?: number }) {
  return <span className="pcard back" style={{ animationDelay: `${index * 0.13}s` }} aria-hidden />;
}
