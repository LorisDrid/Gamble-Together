"use client";

import { useEffect, useState } from "react";
import { BLACKJACK_DEALER_ID, handValue } from "@gamble/shared";
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

/** Render a ±n modifier as a signed chip ("+1" / "−1"). */
function modifierLabel(modifier: number): string {
  return `${modifier > 0 ? "+" : "−"}${Math.abs(modifier)}`;
}

const SUIT_SYMBOL: Record<string, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

/** Short label for a card, e.g. "A♠". */
function cardLabel(card: { rank: string; suit: string }): string {
  return `${card.rank}${SUIT_SYMBOL[card.suit] ?? ""}`;
}

interface BlackjackTableProps {
  view: BlackjackView;
  playerId: string;
}

export function BlackjackTable({ view, playerId }: BlackjackTableProps) {
  // Pending wager built up locally by stacking chips, committed on "Miser".
  const [pendingBet, setPendingBet] = useState(0);
  // Sabotage power: which sign to apply when a target is picked.
  const [delta, setDelta] = useState<1 | -1>(1);
  // Greffe (Dame): index of my own card selected for the swap, if any.
  const [graftMine, setGraftMine] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const socket = getSocket();
  const me = view.players.find((p) => p.id === playerId);
  // Players act in parallel: I act whenever I still can, regardless of others
  const myTurn = me?.canAct ?? false;
  const waitingOnOthers = view.players.some((p) => p.canAct);
  const myPower = view.phase === "playing" ? me?.pendingPower ?? null : null;

  // Fresh round → clear the chips I had stacked and reset the power state
  useEffect(() => {
    setPendingBet(0);
    setDelta(1);
    setGraftMine(null);
  }, [view.round]);

  const onAck = (res: GameAck) => {
    setError(res.ok ? null : GAME_ERROR_MESSAGES[res.error]);
  };

  function commitBet() {
    socket.emit("blackjack:bet", pendingBet, onAck);
  }

  function usePower(targetId: string) {
    socket.emit("blackjack:power", { kind: "modulate", targetId, delta }, onAck);
  }

  function activateShield() {
    socket.emit("blackjack:power", { kind: "shield" }, onAck);
  }

  function graft(targetId: string, targetCardIndex: number) {
    if (graftMine === null) return;
    socket.emit(
      "blackjack:power",
      { kind: "graft", targetId, myCardIndex: graftMine, targetCardIndex },
      onAck,
    );
    setGraftMine(null);
  }

  const dealerBase = view.dealerHand.length > 0 ? handValue(view.dealerHand).total : null;
  const dealerValue = dealerBase === null ? null : dealerBase + view.dealerModifier;

  // Targets for a Valet Saboteur: every player in the round (self included) + dealer
  const powerTargets = [
    ...view.players
      .filter((p) => p.inRound)
      .map((p) => ({ id: p.id, label: p.id === playerId ? "Toi" : p.nickname })),
    { id: BLACKJACK_DEALER_ID, label: "Croupier" },
  ];

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
            <span className="seat-foot">
              <span className={dealerValue > 21 ? "total-badge bust" : "total-badge"}>
                {dealerValue}
                {view.dealerHiddenCard && " + ?"}
              </span>
              {view.dealerModifier !== 0 && (
                <span className="mod-badge" title="Sabotage">
                  {modifierLabel(view.dealerModifier)}
                </span>
              )}
            </span>
          )}
        </div>

        <div className="seats">
          {view.players.map((player) => {
            const base = player.hand.length > 0 ? handValue(player.hand).total : null;
            const value = base === null ? null : base + player.modifier;
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
                    {player.pendingPower === "modulate" && (
                      <span className="power-flag" title="Valet Saboteur">🗡️</span>
                    )}
                    {player.pendingPower === "graft" && (
                      <span className="power-flag" title="Dame Saboteuse">👑</span>
                    )}
                    {player.shielded && (
                      <span className="power-flag" title="Bouclier (As)">🛡️</span>
                    )}
                  </div>
                  <div className="seat-meta">{player.chips} jetons</div>
                </div>

                {player.hand.length > 0 && (
                  <div className="hand">
                    {player.hand.map((card, i) => (
                      <PlayingCard key={i} card={card} index={i} special={card.special} />
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
                  {player.modifier !== 0 && (
                    <span className="mod-badge" title="Sabotage">
                      {modifierLabel(player.modifier)}
                    </span>
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

      {myPower === "modulate" && (
        <div className="menu-card power-panel" data-pip="🗡️">
          <h2>Valet Saboteur 🗡️</h2>
          <p className="hint">Applique un modificateur à une main. Choisis le signe, puis la cible.</p>
          <div className="actions delta-pick">
            <button className={delta === 1 ? "" : "secondary"} onClick={() => setDelta(1)}>
              +1
            </button>
            <button className={delta === -1 ? "" : "secondary"} onClick={() => setDelta(-1)}>
              −1
            </button>
          </div>
          <div className="power-targets">
            {powerTargets.map((target) => (
              <button key={target.id} className="power-target" onClick={() => usePower(target.id)}>
                {modifierLabel(delta)} {target.label}
              </button>
            ))}
          </div>
          <button className="secondary" onClick={() => socket.emit("blackjack:skipPower", onAck)}>
            Passer
          </button>
        </div>
      )}

      {myPower === "shield" && (
        <div className="menu-card power-panel" data-pip="🛡️">
          <h2>As Saboteur 🛡️</h2>
          <p className="hint">
            Active un bouclier secret : il bloque toute attaque adverse jusqu'à la fin de la manche.
            Personne ne le voit tant qu'il n'a rien bloqué.
          </p>
          <div className="actions">
            <button onClick={activateShield}>Activer le bouclier 🛡️</button>
            <button className="secondary" onClick={() => socket.emit("blackjack:skipPower", onAck)}>
              Passer
            </button>
          </div>
        </div>
      )}

      {myPower === "graft" && (
        <div className="menu-card power-panel" data-pip="👑">
          <h2>Dame Saboteuse 👑</h2>
          <p className="hint">
            Échange une de tes cartes contre celle d'un adversaire. Choisis ta carte, puis la
            sienne.
          </p>
          <div className="graft-step">
            <span className="zone-label">Ta carte</span>
            <div className="power-targets">
              {(me?.hand ?? []).map((card, idx) =>
                card.special ? null : (
                  <button
                    key={idx}
                    className={graftMine === idx ? "power-target selected" : "power-target"}
                    onClick={() => setGraftMine(idx)}
                  >
                    {cardLabel(card)}
                  </button>
                ),
              )}
            </div>
          </div>
          {graftMine !== null && (
            <div className="graft-step">
              <span className="zone-label">Contre la carte de…</span>
              {view.players
                .filter((p) => p.inRound && p.id !== playerId)
                .map((opponent) => (
                  <div key={opponent.id} className="graft-opponent">
                    <span className="graft-opponent-name">{opponent.nickname}</span>
                    <div className="power-targets">
                      {opponent.hand.map((card, idx) => (
                        <button
                          key={idx}
                          className="power-target"
                          onClick={() => graft(opponent.id, idx)}
                        >
                          {cardLabel(card)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
          <button className="secondary" onClick={() => socket.emit("blackjack:skipPower", onAck)}>
            Passer
          </button>
        </div>
      )}

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
