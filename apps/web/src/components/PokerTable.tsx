"use client";

import { useEffect, useState } from "react";
import type { GameAck, PokerPhase, PokerView } from "@gamble/shared";

import { getSocket } from "@/lib/socket";
import { GAME_ERROR_MESSAGES } from "@/lib/messages";
import { CardBack, PlayingCard } from "@/components/PlayingCard";

const PHASE_LABELS: Record<PokerPhase, string> = {
  waiting: "En attente de joueurs",
  preflop: "Pré-flop",
  flop: "Flop",
  turn: "Turn",
  river: "River",
  showdown: "Abattage",
};

interface PokerTableProps {
  view: PokerView;
  playerId: string;
}

export function PokerTable({ view, playerId }: PokerTableProps) {
  const [raiseTo, setRaiseTo] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const socket = getSocket();
  const me = view.players.find((p) => p.id === playerId);
  const current = view.players.find((p) => p.id === view.currentPlayerId);
  const turn = view.turn;

  // Prefill the raise input with the minimum legal raise whenever it changes
  useEffect(() => {
    if (turn) setRaiseTo(turn.minRaiseTo);
  }, [turn?.minRaiseTo, turn]);

  const onAck = (res: GameAck) => {
    setError(res.ok ? null : GAME_ERROR_MESSAGES[res.error]);
  };

  const canRebuy =
    me !== undefined &&
    me.chips < view.settings.bigBlind &&
    (view.phase === "waiting" || view.phase === "showdown" || me.sittingOut);

  const actionTitle =
    view.phase === "waiting"
      ? view.canStartHand
        ? "Prêt à jouer"
        : "En attente de joueurs"
      : view.phase === "showdown"
        ? "Fin de la main"
        : turn
          ? "À toi de jouer"
          : "Patience…";

  return (
    <>
      <section className="game-table">
        <div className="section-title">
          {view.phase === "waiting"
            ? PHASE_LABELS.waiting
            : `Main ${view.handNumber} — ${PHASE_LABELS[view.phase]}`}
        </div>

        {view.phase === "waiting" ? (
          <p className="table-hint">
            Partage le code de la table — il faut au moins 2 joueurs pour distribuer.
          </p>
        ) : (
          <div className="poker-board">
            <div className="hand">
              {view.community.map((card, i) => (
                <PlayingCard key={i} card={card} />
              ))}
              {Array.from({ length: 5 - view.community.length }, (_, i) => (
                <span key={i} className="pcard-slot" aria-hidden />
              ))}
            </div>
            <div className="poker-pot">
              {view.pot > 0 && <span className="total-badge">Pot · {view.pot}</span>}
              <span className="seat-meta">
                Blinds {view.settings.smallBlind}/{view.settings.bigBlind}
              </span>
            </div>
          </div>
        )}

        <div className="seats">
          {view.players.map((player) => {
            const seatClass = [
              "seat",
              player.id === view.currentPlayerId ? "current" : "",
              player.folded ? "folded" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <div key={player.id} className={seatClass}>
                <div>
                  <div className="seat-name">
                    {player.isDealer && <span className="dealer-chip">D</span>}
                    {player.nickname}
                    {player.id === playerId && " (toi)"}
                  </div>
                  <div className="seat-meta">{player.chips} jetons</div>
                </div>

                {(player.holeCards !== null || player.holeCardCount > 0) && (
                  <div className="hand">
                    {player.holeCards
                      ? player.holeCards.map((card, i) => <PlayingCard key={i} card={card} />)
                      : Array.from({ length: player.holeCardCount }, (_, i) => (
                          <CardBack key={i} />
                        ))}
                  </div>
                )}

                <div className="seat-foot">
                  {player.betThisStreet > 0 && (
                    <span className="chip-token">{player.betThisStreet}</span>
                  )}
                  {player.folded && <span className="seat-meta">couché</span>}
                  {player.allIn && !player.folded && <span className="verdict push">Tapis</span>}
                  {player.sittingOut && view.phase !== "waiting" && (
                    <span className="seat-meta">attend la prochaine main</span>
                  )}
                  {player.result && player.result.winnings > 0 && (
                    <span className="verdict win">
                      +{player.result.winnings}
                      {player.result.handName && ` · ${player.result.handName}`}
                    </span>
                  )}
                  {player.result && player.result.winnings === 0 && player.result.handName && (
                    <span className="seat-meta">{player.result.handName}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="menu-card" data-pip="♣">
        <h2>{actionTitle}</h2>

        {view.phase === "waiting" && !view.canStartHand && (
          <p className="hint">En attente d’un deuxième joueur…</p>
        )}

        {view.phase === "showdown" && view.winners && view.winners.length > 0 && (
          <p className="hint">
            {view.winners
              .map((winner) => {
                const nickname =
                  view.players.find((p) => p.id === winner.playerId)?.nickname ?? "…";
                return `${nickname} remporte ${winner.amount}${winner.handName ? ` (${winner.handName})` : ""}`;
              })
              .join(" · ")}
          </p>
        )}

        {view.canStartHand && (
          <button onClick={() => socket.emit("poker:nextHand", onAck)}>
            {view.phase === "waiting" ? "Démarrer la main" : "Main suivante"}
          </button>
        )}

        {turn && (
          <>
            <div className="actions">
              <button className="secondary" onClick={() => socket.emit("poker:fold", onAck)}>
                Se coucher
              </button>
              {turn.canCheck ? (
                <button onClick={() => socket.emit("poker:check", onAck)}>Parole</button>
              ) : (
                <button onClick={() => socket.emit("poker:call", onAck)}>
                  Suivre ({turn.toCall})
                </button>
              )}
            </div>
            {turn.canRaise && (
              <div className="actions">
                <input
                  aria-label="Relancer à"
                  type="number"
                  min={turn.minRaiseTo}
                  max={turn.maxRaiseTo}
                  value={raiseTo}
                  onChange={(e) => setRaiseTo(Number(e.target.value))}
                />
                <button onClick={() => socket.emit("poker:raise", raiseTo, onAck)}>
                  Relancer à
                </button>
                <button
                  className="secondary"
                  onClick={() => socket.emit("poker:raise", turn.maxRaiseTo, onAck)}
                >
                  Tapis ({turn.maxRaiseTo})
                </button>
              </div>
            )}
          </>
        )}

        {!turn && view.currentPlayerId && view.currentPlayerId !== playerId && (
          <p className="hint">Au tour de {current?.nickname ?? "…"}</p>
        )}

        {canRebuy && (
          <button onClick={() => socket.emit("poker:rebuy", onAck)}>
            Se recharger ({view.settings.startingChips} jetons)
          </button>
        )}

        {error && <p className="error">{error}</p>}
      </div>
    </>
  );
}
