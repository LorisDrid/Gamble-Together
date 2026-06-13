"use client";

import { useEffect, useRef, useState } from "react";
import { numberColor } from "@gamble/shared";
import type { GameAck, RouletteBet, RouletteView } from "@gamble/shared";

import { getSocket } from "@/lib/socket";
import { GAME_ERROR_MESSAGES } from "@/lib/messages";
import { RouletteBoard } from "@/components/RouletteBoard";

const CHIPS = [10, 50, 100] as const;
const SPIN_MS = 2000;

interface RouletteTableProps {
  view: RouletteView;
  playerId: string;
}

export function RouletteTable({ view, playerId }: RouletteTableProps) {
  // Chip values are the bet sizes; each must clear the table minimum
  const chipValues = (CHIPS as readonly number[]).filter((c) => c >= view.settings.minBet);
  const usableChips = chipValues.length > 0 ? chipValues : [view.settings.minBet];
  const [chip, setChip] = useState(usableChips[0]!);
  const [error, setError] = useState<string | null>(null);

  const socket = getSocket();
  const me = view.players.find((p) => p.id === playerId);

  // "Counter" spin: when the result lands, flash random numbers decelerating
  // to a stop on the winning number. Outcome (net, highlight) reveals only once
  // the roll finishes, for suspense.
  const [rolling, setRolling] = useState(false);
  const [displayNumber, setDisplayNumber] = useState(0);
  const rollTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    rollTimers.current.forEach(clearTimeout);
    rollTimers.current = [];

    if (view.phase !== "result" || view.winningNumber === null) {
      setRolling(false);
      return;
    }

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setDisplayNumber(view.winningNumber);
      setRolling(false);
      return;
    }

    const winning = view.winningNumber;
    setRolling(true);
    let delay = 55;
    let elapsed = 0;
    const tick = () => {
      if (elapsed < SPIN_MS) {
        setDisplayNumber(Math.floor(Math.random() * 37));
        elapsed += delay;
        delay *= 1.15; // decelerate
        rollTimers.current.push(setTimeout(tick, delay));
      } else {
        setDisplayNumber(winning);
        setRolling(false);
      }
    };
    rollTimers.current.push(setTimeout(tick, delay));

    return () => {
      rollTimers.current.forEach(clearTimeout);
      rollTimers.current = [];
    };
  }, [view.phase, view.round, view.winningNumber]);

  const onAck = (res: GameAck) => {
    setError(res.ok ? null : GAME_ERROR_MESSAGES[res.error]);
  };

  const placeBet = (bet: RouletteBet) => socket.emit("roulette:bet", bet, onAck);

  const myStake = me?.bets.reduce((sum, bet) => sum + bet.amount, 0) ?? 0;
  const canBet = view.phase === "betting" && me !== undefined && !me.ready;
  const canAfford = canBet && me.chips >= view.settings.minBet;
  const chipAffordable = me !== undefined && chip <= me.chips;
  // Keep the mat on screen (read-only) once bets are validated and through the
  // result, so the player can still see where they bet.
  const showBoard = me !== undefined && (canAfford || me.bets.length > 0);
  const boardInteractive = canAfford && chipAffordable;

  return (
    <>
      <section className="game-table">
        <div className="section-title">Manche {view.round}</div>

        <div className="roulette-stage">
          {view.phase === "result" && view.winningNumber !== null ? (
            <>
              {rolling ? (
                <span className="roulette-wheel spinning" aria-hidden />
              ) : (
                <span className="zone-label">Numéro sorti</span>
              )}
              <span
                className={`roulette-number${rolling ? " rolling" : ""} ${numberColor(
                  rolling ? displayNumber : view.winningNumber,
                )}`}
              >
                {rolling ? displayNumber : view.winningNumber}
              </span>
              {rolling && <span className="zone-label">Rien ne va plus…</span>}
            </>
          ) : (
            <>
              <span className="roulette-wheel" aria-hidden />
              <span className="zone-label">Faites vos jeux</span>
            </>
          )}
        </div>

        <div className="seats">
          {view.players.map((player) => {
            const staked = player.bets.reduce((sum, bet) => sum + bet.amount, 0);
            return (
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
                    ? `${player.bets.length} mise${player.bets.length > 1 ? "s" : ""} · ${staked}`
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
                  {view.phase === "result" && !rolling && player.lastNet !== null && (
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
            );
          })}
        </div>
      </section>

      <div className="menu-card" data-pip="♥">
        <h2>
          {view.phase === "result"
            ? rolling
              ? "La roue tourne…"
              : "Tour terminé"
            : me?.ready
              ? "Mises validées"
              : "Place tes mises"}
        </h2>

        {canAfford && (
          <div className="field">
            <span className="zone-label">Choisis ton jeton, puis clique sur le tapis</span>
            <div className="chip-rack">
              {usableChips.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`chip-btn c${value}${chip === value ? " selected" : ""}`}
                  disabled={me!.chips < value}
                  onClick={() => setChip(value)}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        )}

        {showBoard && (
          <RouletteBoard
            bets={me!.bets}
            amount={chip}
            disabled={!boardInteractive}
            winningNumber={view.phase === "result" && !rolling ? view.winningNumber : null}
            onBet={placeBet}
          />
        )}

        {canAfford && !chipAffordable && (
          <p className="hint">Pas assez de jetons pour ce jeton — choisis-en un plus petit.</p>
        )}
        {me && me.bets.length > 0 && <p className="hint">Total misé : {myStake} jetons</p>}

        {canBet && (
          <div className="actions">
            <button onClick={() => socket.emit("roulette:ready", onAck)}>
              {me!.bets.length > 0 ? "Valider mes mises" : "Passer ce tour"}
            </button>
            {me!.bets.length > 0 && (
              <button className="secondary" onClick={() => socket.emit("roulette:clearBets", onAck)}>
                Tout annuler
              </button>
            )}
          </div>
        )}

        {canBet && me!.chips < view.settings.minBet && me!.bets.length === 0 && (
          <button onClick={() => socket.emit("roulette:rebuy", onAck)}>
            Se recharger ({view.settings.startingChips} jetons)
          </button>
        )}

        {view.phase === "betting" && me?.ready && (
          <p className="hint">Mises validées — en attente des autres joueurs…</p>
        )}

        {view.phase === "result" && !rolling && (
          <button onClick={() => socket.emit("roulette:nextRound", onAck)}>Tour suivant</button>
        )}

        {error && <p className="error">{error}</p>}
      </div>
    </>
  );
}
