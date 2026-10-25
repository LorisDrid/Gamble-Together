"use client";

import { useState } from "react";
import { handTotal } from "@gamble/shared";
import type { BaccaratBetKind, BaccaratView, GameAck } from "@gamble/shared";

import { getSocket } from "@/lib/socket";
import { GAME_ERROR_MESSAGES } from "@/lib/messages";
import { PlayingCard } from "@/components/PlayingCard";
import { TableStage, type StageSeat } from "./TableStage";
import { PlayerBadge, PlayerZone } from "./TablePlayer";

const CHIPS = [10, 50, 100] as const;

const ZONES: { kind: BaccaratBetKind; label: string; payout: string }[] = [
  { kind: "player", label: "Joueur", payout: "1:1" },
  { kind: "tie", label: "Égalité", payout: "8:1" },
  { kind: "banker", label: "Banque", payout: "1:1 −5%" },
];

const OUTCOME_LABEL: Record<string, string> = {
  player: "Le Joueur gagne",
  banker: "La Banque gagne",
  tie: "Égalité",
};

interface BaccaratTableProps {
  view: BaccaratView;
  playerId: string;
}

export function BaccaratTable({ view, playerId }: BaccaratTableProps) {
  const chipValues = (CHIPS as readonly number[]).filter((c) => c >= view.settings.minBet);
  const usableChips = chipValues.length > 0 ? chipValues : [view.settings.minBet];
  const [chip, setChip] = useState(usableChips[0]!);
  const [error, setError] = useState<string | null>(null);

  const socket = getSocket();
  const me = view.players.find((p) => p.id === playerId);

  const onAck = (res: GameAck) => setError(res.ok ? null : GAME_ERROR_MESSAGES[res.error]);

  const myStake = me?.bets.reduce((sum, bet) => sum + bet.amount, 0) ?? 0;
  const zoneStake = (kind: BaccaratBetKind) =>
    me?.bets.filter((b) => b.kind === kind).reduce((sum, b) => sum + b.amount, 0) ?? 0;

  const canBet = view.phase === "betting" && me !== undefined && !me.ready;
  const canAfford = canBet && me.chips >= view.settings.minBet;
  const chipAffordable = me !== undefined && chip <= me.chips;
  const canDrop = canAfford && chipAffordable;

  function drop(kind: BaccaratBetKind) {
    if (!canDrop) return;
    socket.emit("baccarat:bet", { kind, amount: chip }, onAck);
  }

  const isResult = view.phase === "result";

  const center = <>
    <span className="table-meta">Manche {view.round}</span>
        <div className="bac-hands">
          {isResult ? (
            <>
              <BacHand label="Joueur" cards={view.playerHand} win={view.outcome === "player"} />
              <BacHand label="Banque" cards={view.bankerHand} win={view.outcome === "banker"} />
            </>
          ) : (
            <span className="zone-label">Faites vos jeux</span>
          )}
        </div>
        {isResult && view.outcome && (
          <div className={`bac-outcome ${view.outcome}`}>{OUTCOME_LABEL[view.outcome]}</div>
        )}

  </>;
  const seats: StageSeat[] = view.players.map((player) => ({
    id: player.id,
    current: view.phase === "betting" && !player.ready,
    content: <>
      <PlayerBadge nickname={player.nickname} detail={`${player.chips} jetons`} />
      <span className="seat-meta">Mise {player.bets.reduce((sum, bet) => sum + bet.amount, 0)}</span>
      {view.phase === "betting" && player.ready && <span className="verdict push">Prêt</span>}
      {isResult && player.lastNet !== null && <span className={player.lastNet > 0 ? "verdict win" : player.lastNet < 0 ? "verdict lose" : "verdict push"}>
        {player.lastNet > 0 ? `+${player.lastNet}` : player.lastNet}
      </span>}
    </>,
  }));
  const self = me && <PlayerZone nickname={me.nickname} detail={`Mise ${myStake}`}
    result={isResult && me.lastNet !== null && <span className={me.lastNet > 0 ? "verdict win" : me.lastNet < 0 ? "verdict lose" : "verdict push"}>{me.lastNet > 0 ? `+${me.lastNet}` : me.lastNet}</span>}>
    <div className="baccarat-zones">
      {ZONES.map((zone) => <button key={zone.kind} type="button"
        className={`bac-zone ${zone.kind}${isResult && view.outcome === zone.kind ? " win" : ""}`}
        disabled={!canDrop} onClick={() => drop(zone.kind)}>
        <span className="bac-zone-label">{zone.label}</span><span className="bac-zone-payout">{zone.payout}</span>
        {zoneStake(zone.kind) > 0 && <span className="bac-stake">{zoneStake(zone.kind)}</span>}
      </button>)}
    </div>
  </PlayerZone>;
  const actions = (
      <div className="table-action-panel" data-pip="♦">
        <h2>{isResult ? "Tour terminé" : me?.ready ? "Mises validées" : "Place tes mises"}</h2>

        {canAfford && (
          <div className="field">

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

        {canAfford && !chipAffordable && (
          <p className="hint">Pas assez de jetons pour ce jeton — choisis-en un plus petit.</p>
        )}
        {myStake > 0 && <p className="hint">Total misé : {myStake} jetons</p>}

        {canBet && (
          <div className="actions">
            <button onClick={() => socket.emit("baccarat:ready", onAck)}>
              {myStake > 0 ? "Valider mes mises" : "Passer ce tour"}
            </button>
            {myStake > 0 && (
              <button className="secondary" onClick={() => socket.emit("baccarat:clearBets", onAck)}>
                Tout annuler
              </button>
            )}
          </div>
        )}

        {canBet && me!.chips < view.settings.minBet && myStake === 0 && (
          <button onClick={() => socket.emit("baccarat:rebuy", onAck)}>
            Se recharger ({view.settings.startingChips} jetons)
          </button>
        )}

        {view.phase === "betting" && me?.ready && (
          <p className="hint">Mises validées — en attente des autres joueurs…</p>
        )}

        {isResult && (
          <button onClick={() => socket.emit("baccarat:nextRound", onAck)}>Tour suivant</button>
        )}

        {error && <p className="error">{error}</p>}
      </div>
  );
  return <TableStage seats={seats} meId={playerId} center={center} self={self} bankroll={me?.chips}
    selfCurrent={canBet} actions={actions} stake={view.players.reduce((sum, p) => sum + p.bets.reduce((total, bet) => total + bet.amount, 0), 0)}
    status={isResult ? "Tour terminé" : me?.ready ? "Mises validées" : "Place tes mises"} className="baccarat-table" />;
}

function BacHand({
  label,
  cards,
  win,
}: {
  label: string;
  cards: BaccaratView["playerHand"];
  win: boolean;
}) {
  return (
    <div className={`bac-hand${win ? " win" : ""}`}>
      <span className="zone-label">{label}</span>
      <div className="hand">
        {cards.map((card, i) => (
          <PlayingCard key={i} card={card} index={i} />
        ))}
      </div>
      <span className="total-badge">{handTotal(cards)}</span>
    </div>
  );
}
