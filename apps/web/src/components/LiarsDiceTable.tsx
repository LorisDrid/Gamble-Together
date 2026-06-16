"use client";

import { useEffect, useState } from "react";
import { bidBeats } from "@gamble/shared";
import type { GameAck, LiarsDiceView } from "@gamble/shared";

import { getSocket } from "@/lib/socket";
import { GAME_ERROR_MESSAGES } from "@/lib/messages";

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

  return (
    <>
      <section className="game-table" data-testid="liars-table">
        <div className="section-title">
          Manche {view.round} · Pot {view.pot}
        </div>

        {/* Current bid / reveal banner */}
        <div className="ld-banner">
          {view.phase === "reveal" && view.reveal ? (
            <span>
              {nameOf(view.reveal.challengerId)} a crié « Menteur ! » — il y avait{" "}
              <strong>{view.reveal.actual}</strong> × <span className="die-face">{DICE_FACES[view.reveal.bid.face]}</span>{" "}
              → <strong>{nameOf(view.reveal.loserId)}</strong> perd un dé
            </span>
          ) : view.phase === "done" ? (
            <span className="ld-winner">🏆 {nameOf(view.winnerId)} remporte le pot !</span>
          ) : view.currentBid ? (
            <span>
              Enchère : <strong>{view.currentBid.quantity}</strong> ×{" "}
              <span className="die-face">{DICE_FACES[view.currentBid.face]}</span> (par {nameOf(view.bidderId)})
            </span>
          ) : (
            <span className="muted">Nouvelle manche — à {nameOf(view.currentPlayerId)} d'ouvrir</span>
          )}
        </div>

        <div className="seats">
          {view.players.map((player) => {
            const current = view.phase === "bidding" && view.currentPlayerId === player.id;
            return (
              <div
                key={player.id}
                className={`seat${current ? " current" : ""}${player.eliminated ? " ld-out" : ""}`}
              >
                <div className="seat-name">
                  {player.nickname}
                  {player.id === playerId && " (toi)"}
                  {player.eliminated && <span className="pres-rank">éliminé</span>}
                </div>
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
                <div className="seat-foot">
                  <span className="seat-meta">{player.chips} jetons</span>
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

      <div className="menu-card" data-pip="🎲">
        {myTurn && (
          <>
            <h2>À toi de jouer</h2>
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
    </>
  );
}
