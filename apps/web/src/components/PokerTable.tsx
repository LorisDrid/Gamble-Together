"use client";

import { useEffect, useState } from "react";
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

interface PokerTableProps {
  view: PokerView;
  playerId: string;
  isHost: boolean;
}

export function PokerTable({ view, playerId, isHost }: PokerTableProps) {
  const [raiseTo, setRaiseTo] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const socket = getSocket();
  const me = view.players.find((p) => p.id === playerId);
  const current = view.players.find((p) => p.id === view.currentPlayerId);
  const turn = view.turn;

  // Prefill the raise input with the minimum legal raise whenever it changes
  useEffect(() => {
    if (turn) setRaiseTo(turn.minRaiseTo);
  }, [turn?.minRaiseTo, turn]);

  const onAck = (res: GameAck) => {
    setError(res.ok ? null : GAME_ERROR_MESSAGES[res.error]);
  };

  const canRebuy =
    me !== undefined &&
    me.chips < view.settings.bigBlind &&
    (view.phase === "waiting" || view.phase === "showdown" || me.sittingOut);

  return (
    <>
      <div className="panel">
        <div className="row">
          <label>
            {view.phase === "waiting" ? PHASE_LABELS.waiting : `Main ${view.handNumber} — ${PHASE_LABELS[view.phase]}`}
          </label>
          <span className="muted">
            Blinds {view.settings.smallBlind}/{view.settings.bigBlind}
          </span>
        </div>
        <div className="hand">
          {view.community.map((card, i) => (
            <PlayingCard key={i} card={card} />
          ))}
          {view.community.length === 0 && view.phase !== "waiting" && (
            <span className="muted">Pas encore de cartes communes</span>
          )}
        </div>
        {view.pot > 0 && <p className="muted">Pot : 🪙 {view.pot}</p>}
      </div>

      <div className="panel">
        <label>Joueurs</label>
        <ul className="players">
          {view.players.map((player) => (
            <li
              key={player.id}
              className={player.id === view.currentPlayerId ? "player-row current" : "player-row"}
            >
              <div className="row">
                <span>
                  {player.isDealer && <span className="badge">D </span>}
                  {player.nickname}
                  {player.id === playerId && " (toi)"}
                </span>
                <span className="muted">
                  🪙 {player.chips}
                  {player.betThisStreet > 0 && ` — mise ${player.betThisStreet}`}
                </span>
              </div>
              {(player.holeCards || player.holeCardCount > 0) && (
                <div className="hand">
                  {player.holeCards
                    ? player.holeCards.map((card, i) => <PlayingCard key={i} card={card} />)
                    : Array.from({ length: player.holeCardCount }, (_, i) => <CardBack key={i} />)}
                </div>
              )}
              <div className="row">
                <span className="muted">
                  {player.folded && "couché"}
                  {player.allIn && !player.folded && "tapis !"}
                  {player.sittingOut && view.phase !== "waiting" && "attend la prochaine main"}
                </span>
                {player.result && player.result.winnings > 0 && (
                  <span className="result-win">
                    +{player.result.winnings}
                    {player.result.handName && ` — ${player.result.handName}`}
                  </span>
                )}
                {player.result && player.result.winnings === 0 && player.result.handName && (
                  <span className="result-push">{player.result.handName}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="panel">
        {view.phase === "waiting" && !view.canStartHand && (
          <p className="muted">En attente d’un deuxième joueur… Partage le code de la table !</p>
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
              <div className="actions">
                <input
                  aria-label="Relancer à"
                  type="number"
                  min={turn.minRaiseTo}
                  max={turn.maxRaiseTo}
                  value={raiseTo}
                  onChange={(e) => setRaiseTo(Number(e.target.value))}
                />
                <button onClick={() => socket.emit("poker:raise", raiseTo, onAck)}>
                  Relancer à
                </button>
                <button
                  className="secondary"
                  onClick={() => socket.emit("poker:raise", turn.maxRaiseTo, onAck)}
                >
                  Tapis ({turn.maxRaiseTo})
                </button>
              </div>
            )}
          </>
        )}

        {!turn && view.currentPlayerId && view.currentPlayerId !== playerId && (
          <p className="muted">Au tour de {current?.nickname ?? "…"}</p>
        )}

        {canRebuy && (
          <button onClick={() => socket.emit("poker:rebuy", onAck)}>
            Se recharger ({view.settings.startingChips} jetons)
          </button>
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
