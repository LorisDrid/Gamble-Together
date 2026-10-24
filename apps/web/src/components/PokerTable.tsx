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

/**
 * Opponent seat anchors (left%, top% of the stage) keyed by the NUMBER of
 * opponents. The hero always sits at the bottom centre, so the opponents are
 * laid out clockwise from the hero's left neighbour (first entry, lower-left)
 * up and around to the right neighbour (last entry, lower-right). Every row is
 * symmetric about the vertical axis, so the arrangement reads the same for
 * every player and the left/right neighbours keep fixed places.
 */
const SEAT_POS: Record<number, ReadonlyArray<readonly [number, number]>> = {
  1: [[50, 15]],
  2: [[17, 30], [83, 30]],
  3: [[15, 40], [50, 11], [85, 40]],
  4: [[13, 44], [33, 14], [67, 14], [87, 44]],
  5: [[12, 53], [23, 16], [50, 9], [77, 16], [88, 53]],
};

/** Fallback arc for unexpected counts (e.g. a spectator view with no hero). */
const fallbackArc = (count: number): ReadonlyArray<readonly [number, number]> =>
  Array.from({ length: count }, (_, i) => [10 + (80 * (i + 1)) / (count + 1), 14] as const);

const initials = (name: string) => name.trim().slice(0, 2).toUpperCase() || "?";

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

  // Opponents, in clockwise order starting from the hero's left neighbour, so
  // every client renders itself at the bottom with a consistent relative order.
  const meIdx = view.players.findIndex((p) => p.id === playerId);
  const opponents =
    meIdx >= 0
      ? Array.from({ length: view.players.length - 1 }, (_, k) => view.players[(meIdx + 1 + k) % view.players.length])
      : view.players;
  const positions = SEAT_POS[opponents.length] ?? fallbackArc(opponents.length);

  return (
    <>
      <section className="poker-stage" data-count={view.players.length}>
        <div className="poker-felt" aria-hidden />

        <div className="poker-center">
          {view.phase === "waiting" ? (
            <p className="table-hint">
              Partage le code de la table — il faut au moins 2 joueurs pour distribuer.
            </p>
          ) : (
            <>
              <div className="poker-community">
                {view.community.map((card, i) => (
                  <PlayingCard key={i} card={card} index={Math.max(0, i - prevCommunityLen.current)} />
                ))}
                {Array.from({ length: 5 - view.community.length }, (_, i) => (
                  <span key={i} className="pcard-slot" aria-hidden />
                ))}
              </div>
              {view.pot > 0 && <span className="total-badge">Pot · {view.pot}</span>}
              <span className="poker-meta">
                Blinds {view.settings.smallBlind}/{view.settings.bigBlind} · Main {view.handNumber} ·{" "}
                {PHASE_LABELS[view.phase]}
              </span>
            </>
          )}
        </div>

        {opponents.map((player, i) => {
          const [left, top] = positions[i] ?? [50, 15];
          const seatClass = [
            "pseat",
            player.id === view.currentPlayerId ? "current" : "",
            player.folded ? "folded" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <div key={player.id} className={seatClass} style={{ left: `${left}%`, top: `${top}%` }}>
              {(player.holeCards !== null || player.holeCardCount > 0) && (
                <div className="pseat-hand">
                  {player.holeCards
                    ? player.holeCards.map((card, j) => (
                        <PlayingCard key={j} card={card} index={j} flip />
                      ))
                    : Array.from({ length: player.holeCardCount }, (_, j) => (
                        <CardBack key={j} index={j} />
                      ))}
                </div>
              )}

              {player.betThisStreet > 0 && (
                <span className="pseat-bet" title="Mise">
                  {player.betThisStreet}
                </span>
              )}

              <div className="pseat-badge">
                <span className="pseat-ava">{initials(player.nickname)}</span>
                <span className="pseat-id">
                  <span className="pseat-name">
                    {player.isDealer && <span className="dealer-chip">D</span>}
                    {player.nickname}
                  </span>
                  <span className="pseat-chips">{player.chips} jetons</span>
                </span>
              </div>

              <div className="pseat-foot">
                {player.folded && <span className="seat-meta">couché</span>}
                {player.allIn && !player.folded && <span className="verdict push">Tapis</span>}
                {player.sittingOut && view.phase !== "waiting" && (
                  <span className="seat-meta">attend</span>
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

        {me && (
          <div className={`poker-hero ${me.id === view.currentPlayerId ? "current" : ""}`}>
            <div className="hero-stack" aria-hidden>
              <div className="hero-discs">
                <span className="hero-disc r" />
                <span className="hero-disc r" />
                <span className="hero-disc k" />
                <span className="hero-disc k" />
                <span className="hero-disc w" />
              </div>
              <span className="pseat-chips">{me.chips} jetons</span>
            </div>

            <div className="hero-hand">
              {me.betThisStreet > 0 && (
                <span className="pseat-bet" title="Mise">
                  {me.betThisStreet}
                </span>
              )}
              {turn && <span className="hero-turn">À toi de jouer</span>}
              <div className="hero-cards">
                {me.holeCards
                  ? me.holeCards.map((card, i) => <PlayingCard key={i} card={card} index={i} />)
                  : Array.from({ length: me.holeCardCount }, (_, i) => <CardBack key={i} index={i} />)}
                {!me.holeCards && me.holeCardCount === 0 && (
                  <>
                    <span className="pcard-slot" aria-hidden />
                    <span className="pcard-slot" aria-hidden />
                  </>
                )}
              </div>
              <div className="hero-id">
                {me.isDealer && <span className="dealer-chip">D</span>}
                {me.nickname} (toi)
              </div>
              <div className="hero-foot">
                {me.folded && <span className="seat-meta">couché</span>}
                {me.allIn && !me.folded && <span className="verdict push">Tapis</span>}
                {me.sittingOut && view.phase !== "waiting" && (
                  <span className="seat-meta">tu attends la prochaine main</span>
                )}
                {me.result && me.result.winnings > 0 && (
                  <span className="verdict win">
                    +{me.result.winnings}
                    {me.result.handName && ` · ${me.result.handName}`}
                  </span>
                )}
                {me.result && me.result.winnings === 0 && me.result.handName && (
                  <span className="seat-meta">{me.result.handName}</span>
                )}
              </div>
            </div>
          </div>
        )}
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
