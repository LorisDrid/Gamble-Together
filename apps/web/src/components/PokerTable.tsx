"use client";

import { useEffect, useRef, useState } from "react";
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

/** Chip denominations to nudge a raise up, like the blackjack bet rack. */
const CHIPS = [10, 50, 100] as const;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

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

  // Reset the raise selection to the legal minimum each time it becomes my turn
  useEffect(() => {
    if (turn) setRaiseTo(turn.minRaiseTo);
  }, [turn?.minRaiseTo, turn]);

  // Stagger only the community cards that are NEW this street (flop deals 3,
  // turn/river deal 1) so the board cascades without lagging single cards.
  const prevCommunityLen = useRef(0);
  useEffect(() => {
    prevCommunityLen.current = view.community.length;
  }, [view.community.length]);

  const onAck = (res: GameAck) => {
    setError(res.ok ? null : GAME_ERROR_MESSAGES[res.error]);
  };

  // Pot-relative raise presets (clamped to the legal range)
  let halfPotRaise = 0;
  let potRaise = 0;
  if (turn) {
    const potAfterCall = view.pot + turn.toCall;
    halfPotRaise = clamp(view.currentBet + Math.floor(potAfterCall / 2), turn.minRaiseTo, turn.maxRaiseTo);
    potRaise = clamp(view.currentBet + potAfterCall, turn.minRaiseTo, turn.maxRaiseTo);
  }

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
                <PlayingCard key={i} card={card} index={Math.max(0, i - prevCommunityLen.current)} />
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
                {player.betThisStreet > 0 && (
                  <span className="seat-bet" title="Mise">
                    {player.betThisStreet}
                  </span>
                )}
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
                      ? player.holeCards.map((card, i) => (
                          // My own cards deal in; opponents' cards flip face-up at showdown
                          <PlayingCard
                            key={i}
                            card={card}
                            index={i}
                            flip={player.id !== playerId}
                          />
                        ))
                      : Array.from({ length: player.holeCardCount }, (_, i) => (
                          <CardBack key={i} index={i} />
                        ))}
                  </div>
                )}

                <div className="seat-foot">
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
              <div className="raise-panel">
                <p className="bet-summary">
                  Relance à <strong>{raiseTo}</strong>
                </p>
                <div className="chip-rack">
                  {CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      className={`chip-btn c${chip}`}
                      disabled={raiseTo >= turn.maxRaiseTo}
                      onClick={() => setRaiseTo((value) => Math.min(value + chip, turn.maxRaiseTo))}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
                <div className="actions raise-presets">
                  <button className="secondary" onClick={() => setRaiseTo(turn.minRaiseTo)}>
                    Min
                  </button>
                  <button className="secondary" onClick={() => setRaiseTo(halfPotRaise)}>
                    ½ Pot
                  </button>
                  <button className="secondary" onClick={() => setRaiseTo(potRaise)}>
                    Pot
                  </button>
                  <button className="secondary" onClick={() => setRaiseTo(turn.maxRaiseTo)}>
                    Tapis
                  </button>
                </div>
                <button onClick={() => socket.emit("poker:raise", raiseTo, onAck)}>
                  {raiseTo >= turn.maxRaiseTo ? `Tapis (${raiseTo})` : `Relancer à ${raiseTo}`}
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
