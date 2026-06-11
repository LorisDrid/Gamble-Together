"use client";

import { useState } from "react";
import { numberColor } from "@gamble/shared";
import type { GameAck, RouletteBet, RouletteView } from "@gamble/shared";

import { getSocket } from "@/lib/socket";
import { GAME_ERROR_MESSAGES } from "@/lib/messages";

const KIND_LABELS = {
  red: "Rouge",
  black: "Noir",
  even: "Pair",
  odd: "Impair",
} as const;

function betLabel(bet: RouletteBet): string {
  return bet.kind === "straight" ? `Numéro ${bet.number}` : KIND_LABELS[bet.kind];
}

function WinningNumber({ value }: { value: number }) {
  return <span className={`roulette-number ${numberColor(value)}`}>{value}</span>;
}

interface RouletteTableProps {
  view: RouletteView;
  playerId: string;
}

export function RouletteTable({ view, playerId }: RouletteTableProps) {
  const [amount, setAmount] = useState(view.settings.minBet);
  const [straightNumber, setStraightNumber] = useState(7);
  const [error, setError] = useState<string | null>(null);

  const socket = getSocket();
  const me = view.players.find((p) => p.id === playerId);

  const onAck = (res: GameAck) => {
    setError(res.ok ? null : GAME_ERROR_MESSAGES[res.error]);
  };

  const placeBet = (bet: RouletteBet) => socket.emit("roulette:bet", bet, onAck);

  const myStake = me?.bets.reduce((sum, bet) => sum + bet.amount, 0) ?? 0;
  const canBet = view.phase === "betting" && me !== undefined && !me.ready;

  return (
    <>
      <div className="panel">
        <label>Manche {view.round}</label>
        {view.phase === "result" && view.winningNumber !== null ? (
          <div className="roulette-result">
            <WinningNumber value={view.winningNumber} />
          </div>
        ) : (
          <p className="muted">La roue tournera quand tout le monde aura validé ses mises.</p>
        )}
      </div>

      <div className="panel">
        <label>Joueurs</label>
        <ul className="players">
          {view.players.map((player) => (
            <li key={player.id} className="player-row">
              <div className="row">
                <span>
                  {player.nickname}
                  {player.id === playerId && " (toi)"}
                </span>
                <span className="muted">🪙 {player.chips}</span>
              </div>
              <div className="row">
                <span className="muted">
                  {player.bets.length > 0
                    ? player.bets.map(betLabel).join(", ")
                    : view.phase === "betting"
                      ? "aucune mise"
                      : "a passé"}
                </span>
                {view.phase === "betting" &&
                  (player.ready ? (
                    <span className="badge">✓ Prêt</span>
                  ) : (
                    <span className="muted">mise…</span>
                  ))}
                {view.phase === "result" && player.lastNet !== null && (
                  <span
                    className={
                      player.lastNet > 0
                        ? "result-win"
                        : player.lastNet < 0
                          ? "result-lose"
                          : "result-push"
                    }
                  >
                    {player.lastNet > 0 ? `+${player.lastNet}` : player.lastNet}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="panel">
        {canBet && me.chips >= view.settings.minBet && (
          <>
            <label htmlFor="amount">
              Montant de la mise (min {view.settings.minBet}, jetons {me.chips})
            </label>
            <input
              id="amount"
              type="number"
              min={view.settings.minBet}
              max={me.chips}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
            <div className="actions">
              <button onClick={() => placeBet({ kind: "red", amount })}>Rouge</button>
              <button onClick={() => placeBet({ kind: "black", amount })}>Noir</button>
              <button onClick={() => placeBet({ kind: "even", amount })}>Pair</button>
              <button onClick={() => placeBet({ kind: "odd", amount })}>Impair</button>
            </div>
            <div className="actions">
              <input
                aria-label="Numéro plein (0 à 36)"
                type="number"
                min={0}
                max={36}
                value={straightNumber}
                onChange={(e) => setStraightNumber(Number(e.target.value))}
              />
              <button onClick={() => placeBet({ kind: "straight", number: straightNumber, amount })}>
                Numéro plein (35:1)
              </button>
            </div>
          </>
        )}

        {canBet && me.chips < view.settings.minBet && me.bets.length === 0 && (
          <button onClick={() => socket.emit("roulette:rebuy", onAck)}>
            Se recharger ({view.settings.startingChips} jetons)
          </button>
        )}

        {canBet && (
          <>
            {me.bets.length > 0 && (
              <p className="muted">
                Tes mises : {me.bets.map((bet) => `${betLabel(bet)} (${bet.amount})`).join(", ")} —
                total {myStake}
              </p>
            )}
            <div className="actions">
              <button onClick={() => socket.emit("roulette:ready", onAck)}>
                {me.bets.length > 0 ? "Valider mes mises" : "Passer ce tour"}
              </button>
              {me.bets.length > 0 && (
                <button className="secondary" onClick={() => socket.emit("roulette:clearBets", onAck)}>
                  Tout annuler
                </button>
              )}
            </div>
          </>
        )}

        {view.phase === "betting" && me?.ready && (
          <p className="muted">Mises validées — en attente des autres joueurs…</p>
        )}

        {view.phase === "result" && (
          <button onClick={() => socket.emit("roulette:nextRound", onAck)}>Tour suivant</button>
        )}

        {error && <p className="error">{error}</p>}
      </div>
    </>
  );
}
