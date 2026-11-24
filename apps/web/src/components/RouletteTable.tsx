"use client";

import { useState } from "react";
import { numberColor } from "@gamble/shared";
import type { GameAck, RouletteBet, RoulettePhase, RouletteView } from "@gamble/shared";

import { getSocket } from "@/lib/socket";
import { GAME_ERROR_MESSAGES } from "@/lib/messages";
import { RouletteBoard } from "@/components/RouletteBoard";
import { ChipButton } from "./art/Chip";
import { Icon } from "./art/Icon";
import { RouletteWheel } from "./art/RouletteWheel";
import { PlayerBadge, PlayerZone } from "./TablePlayer";
import { TableStage, type StageSeat } from "./TableStage";

const CHIPS = [10, 50, 100] as const;
/** Past numbers shown on the felt. */
const HISTORY_SHOWN = 8;

type RoulettePlayer = RouletteView["players"][number];

const staked = (player: RoulettePlayer) => player.bets.reduce((sum, bet) => sum + bet.amount, 0);

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function NetVerdict({ net }: { net: number }) {
  return (
    <span className={net > 0 ? "verdict win" : net < 0 ? "verdict lose" : "verdict push"}>
      {net > 0 ? `+${net}` : net}
    </span>
  );
}

function betsLabel(player: RoulettePlayer): string {
  const count = player.bets.length;
  return count === 0 ? "aucune mise" : `${count} mise${count > 1 ? "s" : ""} · ${staked(player)}`;
}

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

  // The spin plays only when this client saw the round go from betting to
  // result; after a reload or a late join the wheel simply shows where the
  // ball stopped. Derived during render so the outcome never flashes first.
  const [seen, setSeen] = useState<{ phase: RoulettePhase; round: number }>({ phase: view.phase, round: view.round });
  const [spinRound, setSpinRound] = useState<number | null>(null);
  if (seen.phase !== view.phase || seen.round !== view.round) {
    setSeen({ phase: view.phase, round: view.round });
    const justSpun = seen.phase === "betting" && view.phase === "result" && seen.round === view.round;
    setSpinRound(justSpun && !prefersReducedMotion() ? view.round : null);
  }
  const spinning = view.phase === "result" && spinRound === view.round;
  const settled = view.phase === "result" && !spinning;

  const onAck = (res: GameAck) => {
    setError(res.ok ? null : GAME_ERROR_MESSAGES[res.error]);
  };

  const placeBet = (bet: RouletteBet) => socket.emit("roulette:bet", bet, onAck);

  /** Until the ball stops, show each stack as it was before the payout. */
  const shownChips = (player: RoulettePlayer) =>
    spinning && player.lastNet !== null ? player.chips - player.lastNet - staked(player) : player.chips;

  const myStake = me ? staked(me) : 0;
  const canBet = view.phase === "betting" && me !== undefined && !me.ready;
  const canAfford = canBet && me.chips >= view.settings.minBet;
  const chipAffordable = me !== undefined && chip <= me.chips;
  // Keep the mat on screen (read-only) once bets are validated and through the
  // result, so the player can still see where they bet.
  const showBoard = me !== undefined && (canAfford || me.bets.length > 0);
  const boardInteractive = canAfford && chipAffordable;

  // While the ball runs, the newest number would give the result away.
  const history = (spinning ? view.history.slice(1) : view.history).slice(0, HISTORY_SHOWN);
  const ballNumber = view.phase === "result" ? view.winningNumber : (view.history[0] ?? null);

  const seats: StageSeat[] = view.players.map((player) => ({
    id: player.id,
    current: view.phase === "betting" && !player.ready,
    content: (
      <>
        <PlayerBadge nickname={player.nickname} detail={`${shownChips(player)} jetons`}
          marker={view.phase === "betting" && player.ready && <span className="ready-mark"><Icon name="check" label="Prêt" /></span>} />
        <span className="seat-meta">{view.phase === "betting" && !player.ready && player.bets.length === 0 ? "mise…" : betsLabel(player)}</span>
        {settled && player.lastNet !== null && <NetVerdict net={player.lastNet} />}
      </>
    ),
  }));

  const center = (
    <div className="roulette-stage">
      <RouletteWheel number={ballNumber} spinning={spinning} onSpinEnd={() => setSpinRound(null)} />
      <div className="roulette-call">
        {settled && view.winningNumber !== null ? (
          <span className={`roulette-number ${numberColor(view.winningNumber)}`}>{view.winningNumber}</span>
        ) : (
          <span className="roulette-announce">{spinning ? "Rien ne va plus" : "Faites vos jeux"}</span>
        )}
      </div>
      {history.length > 0 && (
        <ol className="roulette-history" aria-label="Derniers numéros">
          {history.map((n, i) => <li key={`${view.round}-${i}`} className={numberColor(n)}>{n}</li>)}
        </ol>
      )}
    </div>
  );

  const self = me && (
    <PlayerZone nickname={me.nickname} detail={me.bets.length > 0 ? `${betsLabel(me)} en jeu` : "aucune mise"}
      result={settled && me.lastNet !== null && <NetVerdict net={me.lastNet} />} />
  );

  const actions = (
    <div className="table-action-panel">
      {canAfford && (
        <div className="chip-rack">
          {usableChips.map((value) => (
            <ChipButton
              key={value}
              value={value}
              selected={chip === value}
              disabled={me!.chips < value}
              onClick={() => setChip(value)}
            />
          ))}
        </div>
      )}

      {canAfford && !chipAffordable && (
        <p className="hint">Pas assez de jetons pour ce jeton — choisis-en un plus petit.</p>
      )}

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
        <p className="hint">En attente des autres joueurs…</p>
      )}

      {settled && (
        <button onClick={() => socket.emit("roulette:nextRound", onAck)}>Tour suivant</button>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );

  const status = spinning
    ? "La roue tourne…"
    : settled
      ? "Tour terminé"
      : me?.ready
        ? "Mises validées"
        : "Place tes mises";

  return (
    <TableStage
      seats={seats}
      meId={playerId}
      center={center}
      self={self}
      board={showBoard && (
        <RouletteBoard
          bets={me!.bets}
          amount={chip}
          disabled={!boardInteractive}
          winningNumber={settled ? view.winningNumber : null}
          onBet={placeBet}
        />
      )}
      // The wheel fills the felt: no lettering under it.
      inscription={<></>}
      bankroll={me ? shownChips(me) : undefined}
      selfCurrent={canBet}
      status={status}
      actions={actions}
      stake={view.players.reduce((sum, p) => sum + staked(p), 0)}
      className="roulette-table"
    />
  );
}
