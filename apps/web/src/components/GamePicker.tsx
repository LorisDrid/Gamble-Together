"use client";

import { useState } from "react";
import {
  DEFAULT_BLACKJACK_SETTINGS,
  DEFAULT_POKER_SETTINGS,
  DEFAULT_ROULETTE_SETTINGS,
  DEFAULT_ROUNDS_PER_LEG,
  MIN_TOURNAMENT_GAMES,
} from "@gamble/shared";
import type { GameKind, GameStartPayload } from "@gamble/shared";

import { getSocket, startTournament } from "@/lib/socket";
import { GAME_ERROR_MESSAGES } from "@/lib/messages";
import { BlackjackArt, PokerArt, RouletteArt } from "@/components/GameArt";

const TOURNAMENT_GAMES: ReadonlyArray<{ kind: GameKind; label: string }> = [
  { kind: "blackjack", label: "Blackjack" },
  { kind: "roulette", label: "Roulette" },
  { kind: "poker", label: "Poker" },
];

interface SettingsField {
  key: string;
  label: string;
  min: number;
  step?: number;
  defaultValue: number;
}

interface GameCardProps {
  id: string;
  title: string;
  description: string;
  art: React.ReactNode;
  fields: SettingsField[];
  disabled: boolean;
  onStart: (settings: Record<string, number>) => void;
}

function GameCard({ id, title, description, art, fields, disabled, onStart }: GameCardProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(fields.map((field) => [field.key, field.defaultValue])),
  );

  return (
    <div className="menu-card game-card">
      <div className="game-art" aria-hidden>
        {art}
      </div>
      <div className="row">
        <h2>{title}</h2>
        <button
          type="button"
          className="icon-btn"
          aria-label={`Paramètres — ${title}`}
          title="Paramètres"
          onClick={() => setShowSettings((value) => !value)}
        >
          ⚙
        </button>
      </div>
      <p className="hint">{description}</p>

      {showSettings &&
        fields.map((field) => (
          <div key={field.key} className="field">
            <label htmlFor={`${id}-${field.key}`}>{field.label}</label>
            <input
              id={`${id}-${field.key}`}
              type="number"
              min={field.min}
              step={field.step ?? 1}
              value={values[field.key]}
              onChange={(e) =>
                setValues((current) => ({ ...current, [field.key]: Number(e.target.value) }))
              }
            />
          </div>
        ))}

      <button className="launch" disabled={disabled} onClick={() => onStart(values)}>
        Lancer
      </button>
    </div>
  );
}

/** Host-only panel: pick a game, tweak its settings (gear), launch it. */
export function GamePicker() {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Tournament builder
  const [tourneyGames, setTourneyGames] = useState<GameKind[]>(["blackjack", "roulette", "poker"]);
  const [roundsPerLeg, setRoundsPerLeg] = useState(DEFAULT_ROUNDS_PER_LEG);

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

  function toggleTourneyGame(kind: GameKind) {
    setTourneyGames((games) =>
      games.includes(kind) ? games.filter((g) => g !== kind) : [...games, kind],
    );
  }

  function launchTournament() {
    setStarting(true);
    setError(null);
    startTournament({ games: tourneyGames, roundsPerLeg, startingChips: 1000 }).then((res) => {
      if (!res.ok) {
        setError(GAME_ERROR_MESSAGES[res.error]);
        setStarting(false);
      }
    });
  }

  const chipsField: SettingsField = {
    key: "startingChips",
    label: "Jetons de départ",
    min: 100,
    step: 100,
    defaultValue: 1000,
  };

  return (
    <>
      <div className="section-title">Choisis un jeu</div>
      <div className="game-row">
        <GameCard
          id="blackjack"
          title="Blackjack"
          description="Bats le croupier sans dépasser 21."
          art={<BlackjackArt />}
          fields={[
            chipsField,
            { key: "minBet", label: "Mise minimale", min: 1, defaultValue: DEFAULT_BLACKJACK_SETTINGS.minBet },
          ]}
          disabled={starting}
          onStart={(settings) => start({ game: "blackjack", settings })}
        />
        <GameCard
          id="roulette"
          title="Roulette"
          description="Rouge ou noir, pair ou impair, ou tente le numéro plein."
          art={<RouletteArt />}
          fields={[
            chipsField,
            { key: "minBet", label: "Mise minimale", min: 1, defaultValue: DEFAULT_ROULETTE_SETTINGS.minBet },
          ]}
          disabled={starting}
          onStart={(settings) => start({ game: "roulette", settings })}
        />
        <GameCard
          id="poker"
          title="Poker"
          description="Texas Hold'em No-Limit. Minimum 2 joueurs."
          art={<PokerArt />}
          fields={[
            chipsField,
            { key: "smallBlind", label: "Petite blind", min: 1, defaultValue: DEFAULT_POKER_SETTINGS.smallBlind },
            { key: "bigBlind", label: "Grosse blind", min: 2, defaultValue: DEFAULT_POKER_SETTINGS.bigBlind },
          ]}
          disabled={starting}
          onStart={(settings) => start({ game: "poker", settings })}
        />
      </div>

      <div className="section-title">Ou un tournoi</div>
      <div className="menu-card pip-red" data-pip="♦">
        <h2>Mode tournoi</h2>
        <p className="hint">
          Enchaîne les jeux cochés ; à chaque jeu, le joueur avec le plus de jetons marque 1 point.
        </p>
        <div className="tourney-games">
          {TOURNAMENT_GAMES.map(({ kind, label }) => {
            const on = tourneyGames.includes(kind);
            return (
              <button
                key={kind}
                type="button"
                className={on ? "tourney-game on" : "tourney-game"}
                onClick={() => toggleTourneyGame(kind)}
              >
                <span className="tg-check">{on ? "✓" : ""}</span>
                {label}
              </button>
            );
          })}
        </div>
        <div className="field">
          <label htmlFor="rounds-per-leg">Manches par jeu</label>
          <input
            id="rounds-per-leg"
            type="number"
            min={1}
            max={20}
            value={roundsPerLeg}
            onChange={(e) => setRoundsPerLeg(Number(e.target.value))}
          />
        </div>
        <button
          className="launch"
          disabled={starting || tourneyGames.length < MIN_TOURNAMENT_GAMES}
          onClick={launchTournament}
        >
          Lancer le tournoi ({tourneyGames.length} jeux)
        </button>
      </div>

      {error && <p className="error">{error}</p>}
    </>
  );
}
