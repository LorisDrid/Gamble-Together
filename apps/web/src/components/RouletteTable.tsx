"use client";

import { useState } from "react";
import { numberColor } from "@gamble/shared";
import type { GameAck, RouletteBet, RouletteView } from "@gamble/shared";

import { getSocket } from "@/lib/socket";
import { GAME_ERROR_MESSAGES } from "@/lib/messages";

type OutsideKind = "red" | "black" | "even" | "odd";

const KIND_LABELS: Record<RouletteBet["kind"], string> = {
  red: "Rouge",
  black: "Noir",
  even: "Pair",
  odd: "Impair",
  straight: "Plein",
};

function betLabel(bet: RouletteBet): string {
  return bet.kind === "straight" ? `N°${bet.number}` : KIND_LABELS[bet.kind];
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
  const canAfford = canBet && me.chips >= view.settings.minBet;

  // Total staked by the player on each outside bet, to stack a chip on the cell
  const stakeOn = (kind: OutsideKind): number =>
    me?.bets.filter((bet) => bet.kind === kind).reduce((sum, bet) => sum + bet.amount, 0) ?? 0;

  const outsideCells: Array<{ kind: OutsideKind; className: string }> = [
    { kind: "red", className: "bet-cell red" },
    { kind: "black", className: "bet-cell black" },
    { kind: "even", className: "bet-cell" },
    { kind: "odd", className: "bet-cell" },
  ];

  return (
    <>
      <section className="game-table">
        <div className="section-title">Manche {view.round}</div>

        <div className="roulette-stage">
          {view.phase === "result" && view.winningNumber !== null ? (
            <>
              <span className="zone-label">Numéro sorti</span>
              <span className={`roulette-number ${numberColor(view.winningNumber)}`}>
                {view.winningNumber}
              </span>
            </>
          ) : (
            <>
              <span className="roulette-wheel" aria-hidden />
              <span className="zone-label">Faites vos jeux</span>
            </>
          )}
        </div>

        <div className="seats">
          {view.players.map((player) => (
            <div key={player.id} className="seat">
              <div>
                <div className="seat-name">
                  {player.nickname}
                  {player.id === playerId && " (toi)"}
                </div>
                <div className="seat-meta">{player.chips} jetons</div>
              </div>

              <div className="seat-meta">
                {player.bets.length > 0
                  ? player.bets.map((bet) => `${betLabel(bet)} · ${bet.amount}`).join(", ")
                  : view.phase === "betting"
                    ? "aucune mise"
                    : "a passé"}
              </div>

              <div className="seat-foot">
                {view.phase === "betting" &&
                  (player.ready ? (
                    <span className="verdict push">✓ Prêt</span>
                  ) : (
                    <span className="seat-meta">mise…</span>
                  ))}
                {view.phase === "result" && player.lastNet !== null && (
                  <span
                    className={
                      player.lastNet > 0
                        ? "verdict win"
                        : player.lastNet < 0
                          ? "verdict lose"
                          : "verdict push"
                    }
                  >
                    {player.lastNet > 0 ? `+${player.lastNet}` : player.lastNet}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="menu-card" data-pip="♥">
        <h2>
          {view.phase === "result"
            ? "Tour terminé"
            : me?.ready
              ? "Mises validées"
              : "Place tes mises"}
        </h2>

        {canAfford && (
          <>
            <div className="field">
              <label htmlFor="amount">
                Valeur du jeton — appliquée à chaque case (min {view.settings.minBet}, dispo{" "}
                {me.chips})
              </label>
              <input
                id="amount"
                type="number"
                min={view.settings.minBet}
                max={me.chips}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
            </div>

            <span className="zone-label">Clique une case pour y poser un jeton</span>
            <div className="bet-grid">
              {outsideCells.map(({ kind, className }) => {
                const staked = stakeOn(kind);
                return (
                  <button
                    key={kind}
                    type="button"
                    className={className}
                    onClick={() => placeBet({ kind, amount })}
                  >
                    {KIND_LABELS[kind]}
                    {staked > 0 && <span className="stake">{staked}</span>}
                  </button>
                );
              })}
            </div>

            <div className="straight-row">
              <div className="straight-pick">
                <label htmlFor="straight">Numéro (0-36)</label>
                <input
                  id="straight"
                  type="number"
                  min={0}
                  max={36}
                  value={straightNumber}
                  onChange={(e) => setStraightNumber(Number(e.target.value))}
                />
              </div>
              <button
                type="button"
                className="bet-cell"
                onClick={() => placeBet({ kind: "straight", number: straightNumber, amount })}
              >
                Miser sur le {straightNumber} · 35:1
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
            {me.bets.length > 0 && <p className="hint">Total misé : {myStake} jetons</p>}
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
          <p className="hint">En attente des autres joueurs…</p>
        )}

        {view.phase === "result" && (
          <button onClick={() => socket.emit("roulette:nextRound", onAck)}>Tour suivant</button>
        )}

        {error && <p className="error">{error}</p>}
      </div>
    </>
  );
}
