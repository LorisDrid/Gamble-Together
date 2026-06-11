"use client";

import { useState } from "react";
import { handValue } from "@gamble/shared";
import type { BlackjackView, GameAck, RoundResult } from "@gamble/shared";

import { getSocket } from "@/lib/socket";
import { GAME_ERROR_MESSAGES } from "@/lib/messages";
import { CardBack, PlayingCard } from "@/components/PlayingCard";

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
  const [betInput, setBetInput] = useState(view.settings.minBet);
  const [error, setError] = useState<string | null>(null);

  const socket = getSocket();
  const me = view.players.find((p) => p.id === playerId);
  const current = view.players.find((p) => p.id === view.currentPlayerId);
  const myTurn = view.currentPlayerId === playerId;

  const onAck = (res: GameAck) => {
    setError(res.ok ? null : GAME_ERROR_MESSAGES[res.error]);
  };

  const dealerValue = view.dealerHand.length > 0 ? handValue(view.dealerHand).total : null;

  const actionTitle =
    view.phase === "betting"
      ? me && me.bet === null && me.chips < view.settings.minBet
        ? "Plus de jetons"
        : "Place ta mise"
      : view.phase === "playing"
        ? myTurn
          ? "À toi de jouer"
          : "Patience…"
        : "Fin de manche";

  return (
    <>
      <section className="game-table">
        <div className="section-title">Manche {view.round}</div>

        <div className="bj-dealer">
          <span className="zone-label">Croupier</span>
          <div className="hand">
            {view.dealerHand.map((card, i) => (
              <PlayingCard key={i} card={card} />
            ))}
            {view.dealerHiddenCard && <CardBack />}
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
              <div
                key={player.id}
                className={player.id === view.currentPlayerId ? "seat current" : "seat"}
              >
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
                      <PlayingCard key={i} card={card} />
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
                  {player.bet !== null && <span className="chip-token">{player.bet}</span>}
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
          <div className="field">
            <label htmlFor="bet">
              Ta mise (min {view.settings.minBet}, max {me.chips})
            </label>
            <div className="actions">
              <input
                id="bet"
                type="number"
                min={view.settings.minBet}
                max={me.chips}
                value={betInput}
                onChange={(e) => setBetInput(Number(e.target.value))}
              />
              <button onClick={() => socket.emit("blackjack:bet", betInput, onAck)}>Miser</button>
            </div>
          </div>
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
            <p className="hint">Au tour de {current?.nickname ?? "…"}</p>
          ))}

        {view.phase === "payout" && (
          <button onClick={() => socket.emit("blackjack:nextRound", onAck)}>Manche suivante</button>
        )}

        {error && <p className="error">{error}</p>}
      </div>
    </>
  );
}
