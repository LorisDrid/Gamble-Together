"use client";

import { useEffect, useState } from "react";
import { bidBeats } from "@gamble/shared";
import type { GameAck, LiarsDiceView } from "@gamble/shared";

import { getSocket } from "@/lib/socket";
import { GAME_ERROR_MESSAGES } from "@/lib/messages";
import { Cup } from "./art/Cup";
import { Die } from "./art/Die";
import { Icon } from "./art/Icon";
import { PlayerBadge, PlayerZone } from "./TablePlayer";
import { TableStage, type StageSeat } from "@/components/TableStage";

/** A player's dice, face up when the viewer may see them, hidden otherwise. */
function DiceRow({ dice, count }: { dice: readonly number[] | null; count: number }) {
  return (
    <div className="ld-dice">
      {dice !== null
        ? dice.map((d, i) => <Die key={i} face={d} className="die" />)
        : Array.from({ length: count }, (_, i) => <Die key={i} face={null} className="die" />)}
    </div>
  );
}

const COUNT_WORDS = ["aucun", "un", "deux", "trois", "quatre", "cinq", "six"] as const;

/** "Tu as trois 5, en comptant le joker": how many of `face` the viewer holds (1s are wild). */
function ownCountHint(dice: readonly number[], face: number): string {
  const jokers = face === 1 ? 0 : dice.filter((d) => d === 1).length;
  const count = dice.filter((d) => d === face).length + jokers;
  const words = COUNT_WORDS[count] ?? String(count);
  if (count === 0) return `Tu n’as aucun ${face}`;
  const withJokers = jokers === 0 ? "" : `, en comptant ${jokers === 1 ? "le joker" : `les ${COUNT_WORDS[jokers] ?? jokers} jokers`}`;
  return `Tu as ${words} ${face}${withJokers}`;
}

interface LiarsDiceTableProps {
  view: LiarsDiceView;
  playerId: string;
}

export function LiarsDiceTable({ view, playerId }: LiarsDiceTableProps) {
  const [quantity, setQuantity] = useState(1);
  const [face, setFace] = useState(2);
  const [error, setError] = useState<string | null>(null);
  const socket = getSocket();

  const me = view.players.find((p) => p.id === playerId);
  const myTurn = view.phase === "bidding" && view.currentPlayerId === playerId;
  const nameOf = (id: string | null) => view.players.find((p) => p.id === id)?.nickname ?? "…";

  // When it becomes our turn (or the bid moves), seed the controls.
  useEffect(() => {
    setQuantity(view.currentBid ? view.currentBid.quantity : 1);
    setFace(view.currentBid ? view.currentBid.face : 2);
  }, [view.round, view.currentPlayerId, view.currentBid?.quantity, view.currentBid?.face]);

  const onAck = (res: GameAck) => setError(res.ok ? null : GAME_ERROR_MESSAGES[res.error]);

  const legalBid = bidBeats(view.currentBid, { quantity, face });
  const diceInPlay = view.players.reduce((sum, p) => sum + p.diceCount, 0);
  const canChallenge = myTurn && view.currentBid !== null;

  function bid() {
    if (!myTurn || !legalBid) return;
    socket.emit("liarsdice:bid", quantity, face, onAck);
  }

  const playerBody = (player: LiarsDiceView["players"][number]) => (
    <>
      <div className="ld-cup-row">
        {player.dice === null && !player.eliminated && player.diceCount > 0 && <Cup />}
        <DiceRow dice={player.dice} count={player.diceCount} />
      </div>
      <PlayerBadge nickname={player.nickname} detail={`${player.chips} jetons`}
        marker={player.eliminated && <span className="pres-rank">éliminé</span>} />
      <div className="seat-foot">
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
    current: view.phase === "bidding" && view.currentPlayerId === player.id,
    dimmed: player.eliminated,
    content: playerBody(player),
  }));

  const center = (
    <>
      <span className="table-meta">
        Manche {view.round} · Pot {view.pot} · {diceInPlay} dé{diceInPlay > 1 ? "s" : ""} en jeu
      </span>
      <div className="ld-banner">
        {view.phase === "reveal" && view.reveal ? (
          <span>
            {nameOf(view.reveal.challengerId)} a crié « Menteur ! » — il y avait{" "}
            <strong>{view.reveal.actual}</strong> ×{" "}
            <Die face={view.reveal.bid.face} className="die-face" /> →{" "}
            <strong>{nameOf(view.reveal.loserId)}</strong> perd un dé
          </span>
        ) : view.phase === "done" ? (
          <span className="ld-winner"><Icon name="trophy" /> {nameOf(view.winnerId)} remporte le pot !</span>
        ) : view.currentBid ? (
          <div className="ld-bid" aria-label={`Enchère : ${view.currentBid.quantity} × ${view.currentBid.face}, par ${nameOf(view.bidderId)}`}>
            <span className="ld-bid-title">Enchère</span>
            <span className="ld-bid-value">{view.currentBid.quantity} × <Die face={view.currentBid.face} className="die-face" /></span>
            <span className="ld-bid-by">par {nameOf(view.bidderId)}</span>
          </div>
        ) : (
          <span className="muted">Nouvelle manche — à {nameOf(view.currentPlayerId)} d'ouvrir</span>
        )}
      </div>
      {view.phase === "bidding" && <span className="ld-rule">Les 1 sont des jokers : ils comptent pour toutes les faces.</span>}
    </>
  );

  const self = me && (
    <PlayerZone nickname={me.nickname} detail={me.eliminated ? "Éliminé" : `${me.diceCount} dés`}>
      <DiceRow dice={me.dice} count={me.diceCount} />
    </PlayerZone>
  );

  const actions = (
      <div className="table-action-panel">
        {myTurn && (
          <>
            {me?.dice && <p className="hint ld-own" aria-live="polite">{ownCountHint(me.dice, face)}</p>}
            <div className="ld-bid-controls">
              <div className="ld-qty">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                >
                  −
                </button>
                <span className="ld-qty-value">{quantity}</span>
                <button type="button" className="secondary" onClick={() => setQuantity((q) => q + 1)}>
                  +
                </button>
              </div>
              <div className="ld-faces">
                {[1, 2, 3, 4, 5, 6].map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`die-btn${face === f ? " selected" : ""}`}
                    aria-pressed={face === f}
                    onClick={() => setFace(f)}
                  >
                    <Die face={f} />
                  </button>
                ))}
              </div>
            </div>
            <div className="actions">
              <button data-testid="bid-submit" onClick={bid} disabled={!legalBid}>
                Enchérir {quantity} × <Die face={face} className="die-face" />
              </button>
              <button
                data-testid="challenge-btn"
                className="secondary"
                onClick={() => socket.emit("liarsdice:challenge", onAck)}
                disabled={!canChallenge}
              >
                Menteur !
              </button>
            </div>
            {!legalBid && view.currentBid && (
              <p className="hint">Enchère trop basse — monte la quantité ou la valeur.</p>
            )}
          </>
        )}

        {view.phase === "bidding" && !myTurn && (
          <p className="hint">Au tour de {nameOf(view.currentPlayerId)}…</p>
        )}

        {view.phase === "reveal" && (
          <button data-testid="next-round-btn" onClick={() => socket.emit("liarsdice:nextRound", onAck)}>
            Manche suivante
          </button>
        )}

        {view.phase === "done" && (
          <p className="hint">Partie terminée — {nameOf(view.winnerId)} rafle le pot.</p>
        )}

        {error && <p className="error">{error}</p>}
      </div>
  );
  return <TableStage seats={seats} meId={playerId} center={center} self={self} bankroll={me?.chips}
    selfCurrent={myTurn} actions={actions} stake={view.pot} data-testid="liars-table"
    status={view.phase === "done" ? "Partie terminée" : view.phase === "reveal" ? "Révélation des dés" : myTurn ? "À toi de jouer" : `Au tour de ${nameOf(view.currentPlayerId)}`} />;
}
