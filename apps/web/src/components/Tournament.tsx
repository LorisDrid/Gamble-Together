"use client";

import type { GameKind, TournamentView } from "@gamble/shared";

import { getSocket } from "@/lib/socket";

const GAME_LABELS: Record<GameKind, string> = {
  blackjack: "Blackjack",
  roulette: "Roulette",
  poker: "Poker",
  president: "Président",
  baccarat: "Baccarat",
};

function winnersText(names: string[]): string {
  if (names.length === 0) return "Personne";
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

function Standings({ view }: { view: TournamentView }) {
  const top = view.standings[0]?.points ?? 0;
  return (
    <ol className="tourney-standings">
      {view.standings.map((s, i) => (
        <li key={s.playerId} className={top > 0 && s.points === top ? "ts-row lead" : "ts-row"}>
          <span className="ts-rank">{i + 1}</span>
          <span className="ts-name">{s.nickname}</span>
          <span className="ts-pts">
            {s.points} pt{s.points > 1 ? "s" : ""}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Compact banner shown above the current leg's table during a tournament. */
export function TournamentBanner({ view }: { view: TournamentView }) {
  return (
    <div className="tournament-banner">
      <div className="tb-legs">
        {view.games.map((g, i) => {
          const cls = i === view.legIndex ? "tb-leg current" : i < view.legIndex ? "tb-leg done" : "tb-leg";
          return (
            <span key={i} className={cls}>
              {GAME_LABELS[g]}
            </span>
          );
        })}
      </div>
      {view.currentGame && (
        <span className="tb-now">
          Jeu {Math.min(view.legIndex + 1, view.games.length)}/{view.games.length} ·{" "}
          {view.roundLimited ? `${view.roundsPerLeg} manches` : "élimination"}
          {view.stakeMultiplier > 1 && ` · mise ×${view.stakeMultiplier}`}
        </span>
      )}
      {view.eliminated.length > 0 && (
        <span className="tb-out">Éliminés : {view.eliminated.join(", ")}</span>
      )}
    </div>
  );
}

/** Full-card overlay between legs and at the end of the tournament. */
export function TournamentOverlay({ view, isHost }: { view: TournamentView; isHost: boolean }) {
  if (view.phase === "done") {
    const topPoints = view.standings[0]?.points ?? 0;
    const champions = view.standings.filter((s) => s.points === topPoints).map((s) => s.nickname);
    return (
      <div className="menu-card tournament-end" data-pip="♦">
        <h2>🏆 Tournoi terminé</h2>
        <p className="champion">{winnersText(champions)} remporte le tournoi !</p>
        <Standings view={view} />
        {isHost && (
          <button onClick={() => getSocket().emit("game:end")}>Retour au lobby</button>
        )}
        {!isHost && <p className="hint">En attente de l’hôte…</p>}
      </div>
    );
  }

  // Intermission
  const next = view.games[view.legIndex];
  return (
    <div className="menu-card tournament-intermission" data-pip="♦">
      <h2>{winnersText(view.lastWinners)} remporte le jeu !</h2>
      <Standings view={view} />
      {next && <p className="hint">Prochain jeu : {GAME_LABELS[next]} — ça reprend dans un instant…</p>}
    </div>
  );
}
