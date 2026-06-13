"use client";

import { useEffect, useState } from "react";
import type { LeaderboardEntry, LeaderboardMetric } from "@gamble/shared";

import { getLeaderboard } from "@/lib/socket";

const METRICS: ReadonlyArray<{ key: LeaderboardMetric; label: string }> = [
  { key: "netTotal", label: "Bilan" },
  { key: "biggestWin", label: "Meilleur coup" },
  { key: "roundsPlayed", label: "Manches" },
];

function value(entry: LeaderboardEntry, metric: LeaderboardMetric): string {
  if (metric === "roundsPlayed") return `${entry.roundsPlayed}`;
  if (metric === "biggestWin") return `+${entry.biggestWin}`;
  return entry.netTotal >= 0 ? `+${entry.netTotal}` : `${entry.netTotal}`;
}

/** `refreshKey` lets the parent force a re-fetch (e.g. once the profile is synced). */
export function Leaderboard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [metric, setMetric] = useState<LeaderboardMetric>("netTotal");
  const [rows, setRows] = useState<LeaderboardEntry[] | null>(null);

  useEffect(() => {
    let active = true;
    setRows(null);
    getLeaderboard(metric).then((r) => {
      if (active) setRows(r);
    });
    return () => {
      active = false;
    };
  }, [metric, refreshKey]);

  return (
    <div className="menu-card" data-pip="♦">
      <div className="row">
        <h2>Classement</h2>
        <div className="lb-tabs">
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              className={metric === m.key ? "lb-tab active" : "lb-tab"}
              onClick={() => setMetric(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {rows === null ? (
        <p className="hint">Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="hint">Aucune partie jouée pour l’instant — sois le premier !</p>
      ) : (
        <ol className="leaderboard">
          {rows.map((entry) => (
            <li key={entry.rank} className={entry.isMe ? "lb-row me" : "lb-row"}>
              <span className="lb-rank">{entry.rank}</span>
              <span className="lb-name">
                {entry.nickname}
                {entry.isMe && " (toi)"}
              </span>
              <span className="lb-val">{value(entry, metric)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
