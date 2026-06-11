"use client";

import { useState } from "react";
import { handValue } from "@gamble/shared";
import type { BlackjackView, GameAck, RoundResult } from "@gamble/shared";

import { getSocket } from "@/lib/socket";
import { GAME_ERROR_MESSAGES } from "@/lib/messages";
import { CardBack, PlayingCard } from "@/components/PlayingCard";

const RESULT_LABELS: Record<RoundResult, string> = {
  win: "Gagné !",
  lose: "Perdu",
  push: "Égalité",
  blackjack: "Blackjack !",
};

interface BlackjackTableProps {
  view: BlackjackView;
  playerId: string;
  isHost: boolean;
}

export function BlackjackTable({ view, playerId, isHost }: BlackjackTableProps) {
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

  return (
    <>
      <div className="panel">
        <label>
          Croupier
          {dealerValue !== null && (view.dealerHiddenCard ? ` — ${dealerValue} + ?` : ` — ${dealerValue}`)}
        </label>
        <div className="hand">
          {view.dealerHand.map((card, i) => (
            <PlayingCard key={i} card={card} />
          ))}
          {view.dealerHiddenCard && <CardBack />}
          {view.dealerHand.length === 0 && <span className="muted">En attente des mises…</span>}
        </div>
      </div>

      <div className="panel">
        <label>Manche {view.round}</label>
        <ul className="players">
          {view.players.map((player) => {
            const value = player.hand.length > 0 ? handValue(player.hand).total : null;
            const busted = value !== null && value > 21;
            return (
              <li
                key={player.id}
                className={player.id === view.currentPlayerId ? "player-row current" : "player-row"}
              >
                <div className="row">
                  <span>
                    {player.nickname}
                    {player.id === playerId && " (toi)"}
                  </span>
                  <span className="muted">
                    🪙 {player.chips}
                    {player.bet !== null && ` — mise ${player.bet}`}
                  </span>
                </div>
                {player.hand.length > 0 && (
                  <div className="hand">
                    {player.hand.map((card, i) => (
                      <PlayingCard key={i} card={card} />
                    ))}
                  </div>
                )}
                <div className="row">
                  <span className="muted">
                    {busted && `${value} — Bust !`}
                    {!busted && value !== null && value}
                    {view.phase === "betting" && player.bet === null && "choisit sa mise…"}
                    {view.phase !== "betting" && !player.inRound && "jouera la prochaine manche"}
                  </span>
                  {player.result && (
                    <span
                      className={
                        player.result === "lose"
                          ? "result-lose"
                          : player.result === "push"
                            ? "result-push"
                            : "result-win"
                      }
                    >
                      {RESULT_LABELS[player.result]}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="panel">
        {view.phase === "betting" && me && me.bet === null && me.chips >= view.settings.minBet && (
          <>
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
          </>
        )}
        {view.phase === "betting" && me && me.bet === null && me.chips < view.settings.minBet && (
          <button onClick={() => socket.emit("blackjack:rebuy", onAck)}>
            Se recharger ({view.settings.startingChips} jetons)
          </button>
        )}
        {view.phase === "betting" && me && me.bet !== null && (
          <p className="muted">Mise placée — en attente des autres joueurs…</p>
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
            <p className="muted">Au tour de {current?.nickname ?? "…"}</p>
          ))}

        {view.phase === "payout" && (
          <button onClick={() => socket.emit("blackjack:nextRound", onAck)}>Manche suivante</button>
        )}

        {error && <p className="error">{error}</p>}
        {isHost && (
          <button className="secondary" onClick={() => socket.emit("game:end")}>
            Terminer la partie
          </button>
        )}
      </div>
    </>
  );
}
