"use client";

import { useEffect, useState } from "react";
import { handValue } from "@gamble/shared";
import type { BlackjackView, GameAck, RoundResult } from "@gamble/shared";

import { getSocket } from "@/lib/socket";
import { GAME_ERROR_MESSAGES } from "@/lib/messages";
import { CardBack, PlayingCard } from "@/components/PlayingCard";

/** Chip denominations the player stacks to build a bet. */
const CHIPS = [10, 50, 100] as const;

const RESULT_LABELS: Record<RoundResult, string> = {
  win: "Gagné",
  lose: "Perdu",
  push: "Égalité",
  blackjack: "Blackjack !",
};

const VERDICT_CLASS: Record<RoundResult, string> = {
  win: "verdict win",
  blackjack: "verdict win",
  push: "verdict push",
  lose: "verdict lose",
};

interface BlackjackTableProps {
  view: BlackjackView;
  playerId: string;
}

export function BlackjackTable({ view, playerId }: BlackjackTableProps) {
  // Pending wager built up locally by stacking chips, committed on "Miser".
  const [pendingBet, setPendingBet] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const socket = getSocket();
  const me = view.players.find((p) => p.id === playerId);
  // Players act in parallel: I act whenever I still can, regardless of others
  const myTurn = me?.canAct ?? false;
  const waitingOnOthers = view.players.some((p) => p.canAct);

  // Fresh round → clear the chips I had stacked
  useEffect(() => {
    setPendingBet(0);
  }, [view.round]);

  const onAck = (res: GameAck) => {
    setError(res.ok ? null : GAME_ERROR_MESSAGES[res.error]);
  };

  function commitBet() {
    socket.emit("blackjack:bet", pendingBet, onAck);
  }

  const dealerValue = view.dealerHand.length > 0 ? handValue(view.dealerHand).total : null;

  const actionTitle =
    view.phase === "betting"
      ? me && me.bet === null && me.chips < view.settings.minBet
        ? "Plus de jetons"
        : "Place ta mise"
      : view.phase === "playing"
        ? myTurn
          ? "À toi de jouer"
          : "En attente des autres joueurs…"
        : "Fin de manche";

  return (
    <>
      <section className="game-table">
        <div className="section-title">Manche {view.round}</div>

        <div className="bj-dealer">
          <span className="zone-label">Croupier</span>
          <div className="hand">
            {view.dealerHand.map((card, i) => (
              // The hole card (index 1) flips face-up when revealed at showdown
              <PlayingCard key={i} card={card} index={i} flip={!view.dealerHiddenCard && i === 1} />
            ))}
            {view.dealerHiddenCard && <CardBack index={1} />}
            {view.dealerHand.length === 0 && (
              <span className="muted">En attente des mises…</span>
            )}
          </div>
          {dealerValue !== null && (
            <span className={dealerValue > 21 ? "total-badge bust" : "total-badge"}>
              {dealerValue}
              {view.dealerHiddenCard && " + ?"}
            </span>
          )}
        </div>

        <div className="seats">
          {view.players.map((player) => {
            const value = player.hand.length > 0 ? handValue(player.hand).total : null;
            const busted = value !== null && value > 21;
            return (
              <div key={player.id} className={player.canAct ? "seat current" : "seat"}>
                {/* Wager sits in the corner of the box, clear of the hand total */}
                {player.bet !== null && (
                  <span className="seat-bet" title="Mise">
                    {player.bet}
                  </span>
                )}
                <div>
                  <div className="seat-name">
                    {player.nickname}
                    {player.id === playerId && " (toi)"}
                  </div>
                  <div className="seat-meta">{player.chips} jetons</div>
                </div>

                {player.hand.length > 0 && (
                  <div className="hand">
                    {player.hand.map((card, i) => (
                      <PlayingCard key={i} card={card} index={i} />
                    ))}
                  </div>
                )}
                {view.phase === "betting" && player.bet === null && (
                  <span className="seat-meta">choisit sa mise…</span>
                )}
                {view.phase !== "betting" && !player.inRound && (
                  <span className="seat-meta">jouera la prochaine manche</span>
                )}

                <div className="seat-foot">
                  {value !== null && (
                    <span className={busted ? "total-badge bust" : "total-badge"}>{value}</span>
                  )}
                  {player.result && (
                    <span className={VERDICT_CLASS[player.result]}>
                      {RESULT_LABELS[player.result]}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="menu-card" data-pip="♠">
        <h2>{actionTitle}</h2>

        {view.phase === "betting" && me && me.bet === null && me.chips >= view.settings.minBet && (
          <>
            <p className="bet-summary">
              Mise : <strong>{pendingBet}</strong> jeton{pendingBet > 1 ? "s" : ""}
              {pendingBet < view.settings.minBet && (
                <span className="hint"> · min {view.settings.minBet}</span>
              )}
            </p>
            <div className="chip-rack">
              {CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className={`chip-btn c${chip}`}
                  disabled={pendingBet + chip > me.chips}
                  onClick={() => setPendingBet((value) => value + chip)}
                >
                  {chip}
                </button>
              ))}
            </div>
            <div className="actions">
              <button disabled={pendingBet < view.settings.minBet} onClick={commitBet}>
                Miser {pendingBet}
              </button>
              <button
                className="secondary"
                disabled={pendingBet === 0}
                onClick={() => setPendingBet(0)}
              >
                Annuler
              </button>
            </div>
          </>
        )}
        {view.phase === "betting" && me && me.bet === null && me.chips < view.settings.minBet && (
          <button onClick={() => socket.emit("blackjack:rebuy", onAck)}>
            Se recharger ({view.settings.startingChips} jetons)
          </button>
        )}
        {view.phase === "betting" && me && me.bet !== null && (
          <p className="hint">Mise placée — en attente des autres joueurs…</p>
        )}

        {view.phase === "playing" &&
          (myTurn ? (
            <div className="actions">
              <button onClick={() => socket.emit("blackjack:hit", onAck)}>Tirer</button>
              <button className="secondary" onClick={() => socket.emit("blackjack:stand", onAck)}>
                Rester
              </button>
            </div>
          ) : (
            <p className="hint">
              {waitingOnOthers ? "Les autres joueurs terminent…" : "Le croupier joue…"}
            </p>
          ))}

        {view.phase === "payout" && <p className="hint">Nouvelle manche dans un instant…</p>}

        {error && <p className="error">{error}</p>}
      </div>
    </>
  );
}
