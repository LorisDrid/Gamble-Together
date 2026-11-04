"use client";

import { createContext, useContext, useEffect, useState } from "react";

/** The running countdown, converted to this device's clock. */
export interface TurnClock {
  deadline: number;
  playerIds: readonly string[];
}

export const TurnClockContext = createContext<TurnClock | null>(null);

const URGENT_SECONDS = 10;

/** Time left for this player to decide; renders nothing when the table isn't waiting on them. */
export function TurnCountdown({ playerId }: { playerId: string }) {
  const clock = useContext(TurnClockContext);
  const deadline = clock?.playerIds.includes(playerId) ? clock.deadline : null;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (deadline === null) return;
    setNow(Date.now());
    const ticker = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(ticker);
  }, [deadline]);

  if (deadline === null) return null;
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  return (
    <span
      className={`turn-countdown${seconds <= URGENT_SECONDS ? " urgent" : ""}`}
      data-testid="turn-countdown"
      title="Temps restant pour jouer"
    >
      {seconds} s
    </span>
  );
}
