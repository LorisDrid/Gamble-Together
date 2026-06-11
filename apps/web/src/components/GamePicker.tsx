"use client";

import { useState } from "react";
import { DEFAULT_BLACKJACK_SETTINGS } from "@gamble/shared";

import { getSocket } from "@/lib/socket";
import { GAME_ERROR_MESSAGES } from "@/lib/messages";

/** Host-only panel: pick a game, tweak its settings (gear), launch it. */
export function GamePicker() {
  const [showSettings, setShowSettings] = useState(false);
  const [startingChips, setStartingChips] = useState(DEFAULT_BLACKJACK_SETTINGS.startingChips);
  const [minBet, setMinBet] = useState(DEFAULT_BLACKJACK_SETTINGS.minBet);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startBlackjack() {
    setStarting(true);
    setError(null);
    getSocket().emit("game:start", { startingChips, minBet }, (res) => {
      if (!res.ok) {
        setError(GAME_ERROR_MESSAGES[res.error]);
        setStarting(false);
      }
      // On success the game:state broadcast switches the whole table to the game view
    });
  }

  return (
    <div className="panel">
      <div className="row">
        <strong>Blackjack</strong>
        <button
          type="button"
          className="icon-btn"
          aria-label="Paramètres du blackjack"
          title="Paramètres"
          onClick={() => setShowSettings((value) => !value)}
        >
          ⚙️
        </button>
      </div>

      {showSettings && (
        <>
          <label htmlFor="startingChips">Jetons de départ</label>
          <input
            id="startingChips"
            type="number"
            min={100}
            step={100}
            value={startingChips}
            onChange={(e) => setStartingChips(Number(e.target.value))}
          />
          <label htmlFor="minBet">Mise minimale</label>
          <input
            id="minBet"
            type="number"
            min={1}
            value={minBet}
            onChange={(e) => setMinBet(Number(e.target.value))}
          />
        </>
      )}

      <button disabled={starting} onClick={startBlackjack}>
        {starting ? "Lancement…" : "Lancer le blackjack"}
      </button>
      <p className="muted">Roulette — bientôt</p>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
