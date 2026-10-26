"use client";

import { useEffect, useState } from "react";
import type { GameAck, PresidentCard, PresidentView } from "@gamble/shared";
import { canPlayPresidentCards } from "@gamble/shared";

import { getSocket } from "@/lib/socket";
import { GAME_ERROR_MESSAGES } from "@/lib/messages";
import { CardHand } from "./CardHand";
import { CardBack, PlayingCard } from "./PlayingCard";
import { PlayerBadge, PlayerZone } from "./TablePlayer";
import { TableStage, type StageSeat } from "@/components/TableStage";

/** Title for a finishing rank given the table size. */
function rankTitle(rank: number, total: number): string {
  if (rank === 1) return "Président";
  if (rank === 2) return "Vice-Président";
  if (rank === total) return "Trou du cul";
  if (rank === total - 1) return "Vice-Trou";
  return "Neutre";
}

function cardId(card: PresidentCard): string {
  return `${card.rank}-${card.suit}`;
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
  }, [view.phase, view.currentPlayerId, view.round, myHand.map(cardId).join(",")]);

  const onAck = (res: GameAck) => setError(res.ok ? null : GAME_ERROR_MESSAGES[res.error]);

  function toggle(index: number) {
    if (!canSelect) return;
    setSelected((cur) =>
      cur.includes(index) ? cur.filter((i) => i !== index) : [...cur, index],
    );
  }

  const selectedCards = selected.map((i) => myHand[i]).filter(Boolean) as PresidentCard[];
  const playable = myTurn && canPlayPresidentCards(selectedCards, view.pile, view.reversed);

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

  const total = view.players.length;

  const playerBody = (player: PresidentView["players"][number]) => (
    <>
      {player.handCount > 0 && <div className="hand" aria-hidden><CardBack /><CardBack index={1} /></div>}
      <PlayerBadge nickname={player.nickname}
        detail={`${player.handCount} cartes · ${player.chips} jetons`}
        marker={player.rank !== null && <span className="pres-rank">{rankTitle(player.rank, total)}</span>} />
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
    </>
  );

  const seats: StageSeat[] = view.players.map((player) => ({
    id: player.id,
    current: view.phase === "playing" && view.currentPlayerId === player.id,
    content: playerBody(player),
  }));

  const center = (
    <>
      <span className="table-meta">
        Manche {view.round} · Pot {view.pot}
        {view.reversed && <span className="pres-flag" title="Le 3 est le plus fort, le 2 le plus faible">🔄 Révolution</span>}
      </span>
      <div className="pres-pile">
        {view.pile ? (
          <div className="hand">
            {view.pile.cards.map((card, i) => (
              <PlayingCard key={cardId(card) + i} card={card} index={i} />
            ))}
          </div>
        ) : (
          <span className="muted">
            {view.phase === "exchange" ? "Échange en cours…" : "Nouveau pli"}
          </span>
        )}
      </div>
      {view.pile && <span className="table-meta">{view.pile.sameRankCount} / 4 cartes de même valeur à la suite</span>}
    </>
  );

  const self = me && (
    <PlayerZone nickname={me.nickname}
      detail={`${me.handCount} cartes${me.rank !== null ? ` · ${rankTitle(me.rank, total)}` : ""}`}
      result={<>{me.passed && view.phase === "playing" && !me.finished && <span className="verdict push">Passe</span>}
        {view.phase === "done" && me.lastNet !== null && <span className={me.lastNet >= 0 ? "verdict win" : "verdict lose"}>{me.lastNet >= 0 ? `+${me.lastNet}` : me.lastNet}</span>}</>}>
      <CardHand cards={myHand} selected={selected} onToggle={toggle} selectable={canSelect} testId="hand-card" />
    </PlayerZone>
  );

  const actions = (
      <section className="pres-actions">
        {canSelect && <p className="hint" aria-live="polite">{selected.length > 0 ? `${selected.length} carte${selected.length > 1 ? "s" : ""} sélectionnée${selected.length > 1 ? "s" : ""}` : "Choisis les cartes à jouer"}</p>}
        {view.phase === "playing" && myTurn && (
          <div className="actions">
            <button data-testid="play-btn" onClick={play} disabled={!playable}>
              Jouer{selectedCards.length > 0 ? ` (${selectedCards.length})` : ""}
            </button>
            <button data-testid="pass-btn" className="secondary" onClick={pass} disabled={leading}>
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
            <button data-testid="next-round-btn" onClick={nextRound}>
              Manche suivante
            </button>
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </section>
  );
  return <TableStage seats={seats} meId={playerId} center={center} self={self}
    bankroll={me?.chips} selfCurrent={canSelect} actions={actions} stake={view.pot}
    status={view.phase === "done" ? "Manche terminée" : owedReturn ? "Choisis les cartes à rendre" : myTurn ? "À toi de jouer" : "En cours"}
    className="president-table" data-testid="president-table" />;
}
