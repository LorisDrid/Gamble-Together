"use client";

import { createContext, useContext } from "react";

/** Ids of the players whose connection dropped; their seat is held for them meanwhile. */
export const OfflinePlayersContext = createContext<ReadonlySet<string>>(new Set());

export function OfflineTag({ playerId }: { playerId: string }) {
  const offline = useContext(OfflinePlayersContext);
  return offline.has(playerId) ? <span className="offline-tag">Déconnecté</span> : null;
}
