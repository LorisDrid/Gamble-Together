"use client";

import { useState } from "react";
import { handTotal } from "@gamble/shared";
import type { BaccaratBetKind, BaccaratView, GameAck } from "@gamble/shared";

import { getSocket } from "@/lib/socket";
import { GAME_ERROR_MESSAGES } from "@/lib/messages";
import { PlayingCard } from "@/components/PlayingCard";

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

  return (
    <>
      <section className="game-table">
        <div className="section-title">Manche {view.round}</div>

        {/* The two hands (revealed at the result) */}
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
                  {isResult && player.lastNet !== null && (
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

      <div className="menu-card" data-pip="♦">
        <h2>{isResult ? "Tour terminé" : me?.ready ? "Mises validées" : "Place tes mises"}</h2>

        {canAfford && (
          <div className="field">
            <span className="zone-label">Choisis ton jeton, puis clique sur une case</span>
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

        {/* The three betting zones */}
        <div className="baccarat-zones">
          {ZONES.map((zone) => {
            const stake = zoneStake(zone.kind);
            const win = isResult && view.outcome === zone.kind;
            return (
              <button
                key={zone.kind}
                type="button"
                className={`bac-zone ${zone.kind}${win ? " win" : ""}`}
                disabled={!canDrop}
                onClick={() => drop(zone.kind)}
              >
                <span className="bac-zone-label">{zone.label}</span>
                <span className="bac-zone-payout">{zone.payout}</span>
                {stake > 0 && <span className="bac-stake">{stake}</span>}
              </button>
            );
          })}
        </div>

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
    </>
  );
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
