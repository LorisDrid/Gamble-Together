"use client";

import { useEffect, useState } from "react";
import { bidBeats } from "@gamble/shared";
import type { GameAck, LiarsDiceView } from "@gamble/shared";

import { getSocket } from "@/lib/socket";
import { GAME_ERROR_MESSAGES } from "@/lib/messages";
import { PlayerBadge, PlayerZone } from "./TablePlayer";
import { TableStage, type StageSeat } from "@/components/TableStage";

const DICE_FACES = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"] as const;


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
  const canChallenge = myTurn && view.currentBid !== null;

  function bid() {
    if (!myTurn || !legalBid) return;
    socket.emit("liarsdice:bid", quantity, face, onAck);
  }

  const playerBody = (player: LiarsDiceView["players"][number]) => (
    <>
      <div className="ld-dice">
        {player.dice !== null
          ? player.dice.map((d, i) => (
              <span key={i} className="die">
                {DICE_FACES[d]}
              </span>
            ))
          : Array.from({ length: player.diceCount }, (_, i) => (
              <span key={i} className="die hidden">
                ?
              </span>
            ))}
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
        Manche {view.round} · Pot {view.pot}
      </span>
      <div className="ld-banner">
        {view.phase === "reveal" && view.reveal ? (
          <span>
            {nameOf(view.reveal.challengerId)} a crié « Menteur ! » — il y avait{" "}
            <strong>{view.reveal.actual}</strong> ×{" "}
            <span className="die-face">{DICE_FACES[view.reveal.bid.face]}</span> →{" "}
            <strong>{nameOf(view.reveal.loserId)}</strong> perd un dé
          </span>
        ) : view.phase === "done" ? (
          <span className="ld-winner">🏆 {nameOf(view.winnerId)} remporte le pot !</span>
        ) : view.currentBid ? (
          <span>
            Enchère : <strong>{view.currentBid.quantity}</strong> ×{" "}
            <span className="die-face">{DICE_FACES[view.currentBid.face]}</span> (par{" "}
            {nameOf(view.bidderId)})
          </span>
        ) : (
          <span className="muted">Nouvelle manche — à {nameOf(view.currentPlayerId)} d'ouvrir</span>
        )}
      </div>
    </>
  );

  const self = me && (
    <PlayerZone nickname={me.nickname} detail={me.eliminated ? "Éliminé" : `${me.diceCount} dés`}>
      <div className="ld-dice">
        {me.dice !== null
          ? me.dice.map((d, i) => (
              <span key={i} className="die">
                {DICE_FACES[d]}
              </span>
            ))
          : Array.from({ length: me.diceCount }, (_, i) => (
              <span key={i} className="die hidden">
                ?
              </span>
            ))}
      </div>
    </PlayerZone>
  );

  const actions = (
      <div className="table-action-panel" data-pip="🎲">
        {myTurn && (
          <>
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
                    onClick={() => setFace(f)}
                  >
                    {DICE_FACES[f]}
                  </button>
                ))}
              </div>
            </div>
            <div className="actions">
              <button data-testid="bid-submit" onClick={bid} disabled={!legalBid}>
                Enchérir
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
