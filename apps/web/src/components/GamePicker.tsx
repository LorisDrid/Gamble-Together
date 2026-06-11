"use client";

import { useState } from "react";
import { DEFAULT_BLACKJACK_SETTINGS, DEFAULT_ROULETTE_SETTINGS } from "@gamble/shared";
import type { GameStartPayload } from "@gamble/shared";

import { getSocket } from "@/lib/socket";
import { GAME_ERROR_MESSAGES } from "@/lib/messages";

interface GameCardProps {
  id: string;
  title: string;
  description: string;
  defaults: { startingChips: number; minBet: number };
  disabled: boolean;
  onStart: (settings: { startingChips: number; minBet: number }) => void;
}

function GameCard({ id, title, description, defaults, disabled, onStart }: GameCardProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [startingChips, setStartingChips] = useState(defaults.startingChips);
  const [minBet, setMinBet] = useState(defaults.minBet);

  return (
    <div className="panel">
      <div className="row">
        <strong>{title}</strong>
        <button
          type="button"
          className="icon-btn"
          aria-label={`Paramètres — ${title}`}
          title="Paramètres"
          onClick={() => setShowSettings((value) => !value)}
        >
          ⚙️
        </button>
      </div>
      <p className="muted">{description}</p>

      {showSettings && (
        <>
          <label htmlFor={`${id}-chips`}>Jetons de départ</label>
          <input
            id={`${id}-chips`}
            type="number"
            min={100}
            step={100}
            value={startingChips}
            onChange={(e) => setStartingChips(Number(e.target.value))}
          />
          <label htmlFor={`${id}-minbet`}>Mise minimale</label>
          <input
            id={`${id}-minbet`}
            type="number"
            min={1}
            value={minBet}
            onChange={(e) => setMinBet(Number(e.target.value))}
          />
        </>
      )}

      <button disabled={disabled} onClick={() => onStart({ startingChips, minBet })}>
        Lancer — {title}
      </button>
    </div>
  );
}

/** Host-only panel: pick a game, tweak its settings (gear), launch it. */
export function GamePicker() {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function start(payload: GameStartPayload) {
    setStarting(true);
    setError(null);
    getSocket().emit("game:start", payload, (res) => {
      if (!res.ok) {
        setError(GAME_ERROR_MESSAGES[res.error]);
        setStarting(false);
      }
      // On success the game:state broadcast switches the whole table to the game view
    });
  }

  return (
    <>
      <GameCard
        id="blackjack"
        title="Blackjack"
        description="Bats le croupier sans dépasser 21."
        defaults={DEFAULT_BLACKJACK_SETTINGS}
        disabled={starting}
        onStart={(settings) => start({ game: "blackjack", settings })}
      />
      <GameCard
        id="roulette"
        title="Roulette"
        description="Rouge ou noir, pair ou impair, ou tente le numéro plein."
        defaults={DEFAULT_ROULETTE_SETTINGS}
        disabled={starting}
        onStart={(settings) => start({ game: "roulette", settings })}
      />
      {error && <p className="error">{error}</p>}
    </>
  );
}
