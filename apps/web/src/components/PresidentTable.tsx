"use client";

import { useEffect, useState } from "react";
import type { GameAck, PresidentCard, PresidentView } from "@gamble/shared";

import { getSocket } from "@/lib/socket";
import { GAME_ERROR_MESSAGES } from "@/lib/messages";

const SUIT_SYMBOLS: Record<string, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

/** Title for a finishing rank given the table size. */
function rankTitle(rank: number, total: number): string {
  if (rank === 1) return "Président";
  if (rank === 2) return "Vice-Président";
  if (rank === total) return "Trou du cul";
  if (rank === total - 1) return "Vice-Trou";
  return "Neutre";
}

function cardId(card: PresidentCard): string {
  return card.kind === "joker" ? `joker-${card.id}` : `${card.rank}-${card.suit}`;
}

interface PresidentTableProps {
  view: PresidentView;
  playerId: string;
}

export function PresidentTable({ view, playerId }: PresidentTableProps) {
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const socket = getSocket();

  const me = view.players.find((p) => p.id === playerId);
  const myHand = me?.hand ?? [];
  const myTurn = view.phase === "playing" && view.currentPlayerId === playerId;
  const leading = myTurn && view.pile === null;
  const owedReturn =
    view.phase === "exchange" ? view.pendingReturns.find((r) => r.fromId === playerId) : undefined;
  const canSelect = myTurn || owedReturn !== undefined;

  // Reset the selection whenever it's no longer ours to act, or the phase moves.
  useEffect(() => {
    setSelected([]);
  }, [view.phase, view.currentPlayerId, view.round]);

  const onAck = (res: GameAck) => setError(res.ok ? null : GAME_ERROR_MESSAGES[res.error]);

  function toggle(index: number) {
    if (!canSelect) return;
    setSelected((cur) =>
      cur.includes(index) ? cur.filter((i) => i !== index) : [...cur, index],
    );
  }

  const selectedCards = selected.map((i) => myHand[i]).filter(Boolean) as PresidentCard[];
  const sameRank =
    selectedCards.length > 0 &&
    selectedCards.every((c) =>
      c.kind === "joker"
        ? selectedCards[0]!.kind === "joker"
        : selectedCards[0]!.kind === "normal" && c.rank === selectedCards[0]!.rank,
    );
  const playable =
    myTurn && sameRank && (leading || selectedCards.length === (view.pile?.count ?? 0));

  function play() {
    if (!playable) return;
    socket.emit("president:play", selectedCards, onAck);
    setSelected([]);
  }

  function pass() {
    socket.emit("president:pass", onAck);
  }

  function giveExchange() {
    if (!owedReturn || selectedCards.length !== owedReturn.count) return;
    socket.emit("president:exchange", selectedCards, onAck);
    setSelected([]);
  }

  function nextRound() {
    socket.emit("president:nextRound", onAck);
  }

  return (
    <>
      <section className="game-table president-table">
        <div className="section-title">
          Manche {view.round} · Pot {view.pot}
          {view.reversed && <span className="pres-flag" title="Révolution">🔄</span>}
        </div>

        {/* Pile */}
        <div className="pres-pile">
          {view.pile ? (
            <div className="hand">
              {view.pile.cards.map((card, i) => (
                <PCard key={cardId(card) + i} card={card} index={i} />
              ))}
            </div>
          ) : (
            <span className="muted">
              {view.phase === "exchange" ? "Échange en cours…" : "Nouveau pli"}
            </span>
          )}
        </div>

        {/* Seats */}
        <div className="seats">
          {view.players.map((player) => {
            const current = view.phase === "playing" && view.currentPlayerId === player.id;
            return (
              <div key={player.id} className={current ? "seat current" : "seat"}>
                <div className="seat-name">
                  {player.nickname}
                  {player.id === playerId && " (toi)"}
                  {player.rank !== null && (
                    <span className="pres-rank">{rankTitle(player.rank, view.players.length)}</span>
                  )}
                </div>
                <div className="seat-meta">
                  {player.handCount} carte{player.handCount > 1 ? "s" : ""} · {player.chips} jetons
                </div>
                <div className="seat-foot">
                  {player.passed && view.phase === "playing" && !player.finished && (
                    <span className="verdict push">Passe</span>
                  )}
                  {view.phase === "done" && player.lastNet !== null && (
                    <span className={player.lastNet >= 0 ? "verdict win" : "verdict lose"}>
                      {player.lastNet >= 0 ? `+${player.lastNet}` : player.lastNet}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* My hand */}
      {myHand.length > 0 && (
        <section className="menu-card pres-hand-card">
          <span className="zone-label">Ta main</span>
          <div className="hand pres-hand">
            {myHand.map((card, i) => (
              <PCard
                key={cardId(card) + i}
                card={card}
                index={i}
                selectable={canSelect}
                selected={selected.includes(i)}
                onClick={() => toggle(i)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Action bar */}
      <section className="menu-card pres-actions">
        {view.phase === "playing" && myTurn && (
          <div className="actions">
            <button onClick={play} disabled={!playable}>
              Jouer{selectedCards.length > 0 ? ` (${selectedCards.length})` : ""}
            </button>
            <button className="secondary" onClick={pass} disabled={leading}>
              Passer
            </button>
          </div>
        )}
        {view.phase === "playing" && !myTurn && (
          <p className="hint">
            Au tour de {view.players.find((p) => p.id === view.currentPlayerId)?.nickname ?? "…"}
          </p>
        )}
        {view.phase === "exchange" && owedReturn && (
          <div>
            <p className="hint">
              Échange : choisis {owedReturn.count} carte{owedReturn.count > 1 ? "s" : ""} à rendre.
            </p>
            <button onClick={giveExchange} disabled={selectedCards.length !== owedReturn.count}>
              Donner {owedReturn.count} carte{owedReturn.count > 1 ? "s" : ""}
            </button>
          </div>
        )}
        {view.phase === "exchange" && !owedReturn && (
          <p className="hint">Échange des cartes en cours…</p>
        )}
        {view.phase === "done" && (
          <div>
            <p className="hint">Manche terminée.</p>
            <button onClick={nextRound}>Manche suivante</button>
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </section>
    </>
  );
}

interface PCardProps {
  card: PresidentCard;
  index: number;
  selectable?: boolean;
  selected?: boolean;
  onClick?: () => void;
}

function PCard({ card, index, selectable = false, selected = false, onClick }: PCardProps) {
  const red = card.kind === "normal" && (card.suit === "hearts" || card.suit === "diamonds");
  const className = [
    "pcard",
    red ? "red" : "",
    card.kind === "joker" ? "joker" : "",
    selected ? "selected" : "",
    selectable ? "pickable" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span
      className={className}
      style={{ animationDelay: `${index * 0.05}s` }}
      onClick={selectable ? onClick : undefined}
    >
      {card.kind === "joker" ? (
        <>
          <span className="pcard-rank">★</span>
          <span className="pcard-suit">JOKER</span>
        </>
      ) : (
        <>
          <span className="pcard-rank">{card.rank}</span>
          <span className="pcard-suit">{SUIT_SYMBOLS[card.suit]}</span>
        </>
      )}
    </span>
  );
}
