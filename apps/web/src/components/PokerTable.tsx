"use client";

import { useEffect, useRef, useState } from "react";
import type { GameAck, PokerPhase, PokerView } from "@gamble/shared";

import { getSocket } from "@/lib/socket";
import { GAME_ERROR_MESSAGES } from "@/lib/messages";
import { CardBack, PlayingCard } from "@/components/PlayingCard";
import { CardHand } from "./CardHand";
import { PlayerBadge, PlayerZone } from "./TablePlayer";
import { TableStage, type StageSeat } from "@/components/TableStage";

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

interface PokerTableProps {
  view: PokerView;
  playerId: string;
}

export function PokerTable({ view, playerId }: PokerTableProps) {
  const [raiseTo, setRaiseTo] = useState(0);
  const [raising, setRaising] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const socket = getSocket();
  const me = view.players.find((p) => p.id === playerId);
  const current = view.players.find((p) => p.id === view.currentPlayerId);
  const turn = view.turn;

  // A socket refresh creates a new turn object, but does not start a new turn.
  const raiseContext = turn ? `${view.handNumber}:${view.phase}:${playerId}` : null;
  const previousRaiseContext = useRef<string | null>(null);
  const minRaiseTo = turn?.minRaiseTo ?? 0;
  const maxRaiseTo = turn?.maxRaiseTo ?? 0;
  useEffect(() => {
    if (raiseContext === null || previousRaiseContext.current !== raiseContext) {
      setRaiseTo(minRaiseTo);
      setRaising(false);
    } else {
      setRaiseTo((value) => clamp(value, minRaiseTo, maxRaiseTo));
    }
    previousRaiseContext.current = raiseContext;
  }, [raiseContext, minRaiseTo, maxRaiseTo]);

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

  // Build a seat for every player; TableStage places the hero at the bottom and
  // the others symmetrically around the felt.
  const seats: StageSeat[] = view.players.map((player) => ({
    id: player.id,
    current: player.id === view.currentPlayerId,
    dimmed: player.folded,
    content: (
      <>
        {(player.holeCards !== null || player.holeCardCount > 0) && (
          <div className="hand">
            {player.holeCards
              ? player.holeCards.map((card, j) => <PlayingCard key={j} card={card} index={j} flip />)
              : Array.from({ length: player.holeCardCount }, (_, j) => <CardBack key={j} index={j} />)}
          </div>
        )}
        <PlayerBadge nickname={player.nickname} detail={`${player.chips} jetons`}
          marker={player.isDealer && <span className="dealer-chip" title="Donneur">D</span>} />
        {player.betThisStreet > 0 && <span className="poker-wager">mise {player.betThisStreet}</span>}
        <div className="seat-foot">
          {player.folded && <span className="seat-meta">couché</span>}
          {player.allIn && !player.folded && <span className="verdict push">Tapis</span>}
          {player.sittingOut && view.phase !== "waiting" && <span className="seat-meta">attend</span>}
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
      </>
    ),
  }));

  const center =
    view.phase === "waiting" ? (
      <p className="table-hint">Partage le code — il faut au moins 2 joueurs pour distribuer.</p>
    ) : (
      <>
        <span className="poker-pot">Pot · <strong>{view.pot}</strong></span>
        <div className="hand">
          {view.community.map((card, i) => (
            <PlayingCard key={i} card={card} index={Math.max(0, i - prevCommunityLen.current)} />
          ))}
          {Array.from({ length: 5 - view.community.length }, (_, i) => (
            <span key={i} className="pcard-slot" aria-hidden />
          ))}
        </div>
        <span className="table-meta">
          Blinds {view.settings.smallBlind}/{view.settings.bigBlind} · Main {view.handNumber} ·{" "}
          {PHASE_LABELS[view.phase]}
        </span>
      </>
    );

  const self = me && (
    <PlayerZone nickname={me.nickname}
      detail={<>{me.sittingOut ? "Attend la prochaine main" : me.folded ? "Couché" : me.allIn ? "Tapis" : "Dans la partie"}{me.betThisStreet > 0 && ` · mise ${me.betThisStreet}`}</>}
      marker={me.isDealer && <span className="dealer-chip" title="Donneur">D</span>}
      result={me.result && (me.result.winnings > 0
        ? <span className="verdict win">+{me.result.winnings}{me.result.handName && ` · ${me.result.handName}`}</span>
        : <span className="seat-meta">{me.result.handName}</span>)}>
      {me.holeCards ? <CardHand cards={me.holeCards} /> : <div className="hand">
        {Array.from({ length: me.holeCardCount || 2 }, (_, i) => me.holeCardCount
          ? <CardBack key={i} index={i} /> : <span key={i} className="pcard-slot" aria-hidden />)}
      </div>}
    </PlayerZone>
  );

  const actions = (
    <div className="poker-controls" aria-label="Actions de poker">

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
                Suivre {turn.toCall}
              </button>
            )}
            {turn.canRaise && (
              <button className="secondary" aria-expanded={raising} aria-controls="poker-raise" onClick={() => setRaising((open) => !open)}>
                Relancer
              </button>
            )}
          </div>

          {turn.canRaise && raising && (
            <div className="raise-panel" id="poker-raise">
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
  );

  return (
    <TableStage
      seats={seats}
      meId={playerId}
      center={center}
      self={self}
      bankroll={me?.chips}
      status={actionTitle}
      stake={view.pot}
      selfCurrent={Boolean(turn)}
      actions={actions}
      className="poker-table"
    />
  );
}
