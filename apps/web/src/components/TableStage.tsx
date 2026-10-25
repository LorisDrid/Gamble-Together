"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Shared table geometry; each client rotates the ring around its own seat. */
const SEAT_POS: Record<number, ReadonlyArray<readonly [number, number]>> = {
  1: [[50, 15]],
  2: [[12, 70], [88, 70]],
  3: [[12, 70], [50, 15], [88, 70]],
  4: [[12, 70], [24, 24], [76, 24], [88, 70]],
  5: [[12, 70], [24, 24], [50, 15], [76, 24], [88, 70]],
};

/** Fallback arc for unexpected counts (e.g. a spectator view with no hero). */
const fallbackArc = (count: number): ReadonlyArray<readonly [number, number]> =>
  Array.from({ length: count }, (_, i) => [10 + (80 * (i + 1)) / (count + 1), 14] as const);

export interface StageSeat {
  id: string;
  /** Compact content shown for this player when they are an opponent. */
  content: ReactNode;
  current?: boolean;
  dimmed?: boolean;
}

interface TableStageProps {
  /** Every player, in ring/seat order (the viewer is found by `meId`). */
  seats: StageSeat[];
  meId: string;
  /** Middle of the felt (board, dealer, pile, bid banner…). */
  center?: ReactNode;
  /** The viewer's own zone, shown as a simple strip below the felt. */
  self?: ReactNode;
  selfCurrent?: boolean;
  /** Optional controls sharing the same frame as the table and local hand. */
  actions?: ReactNode;
  bankroll?: number;
  status?: ReactNode;
  /** Increasing stake totals trigger a shared chip movement, independent of the game. */
  stake?: number;
  className?: string;
  "data-testid"?: string;
}

export function TableStage({
  seats,
  meId,
  center,
  self,
  selfCurrent = false,
  actions,
  bankroll,
  status,
  stake = 0,
  className,
  "data-testid": testId,
}: TableStageProps) {
  const stageRef = useRef<HTMLElement>(null);
  const seatIds = seats.map((seat) => seat.id).join(",");
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const elements = [...stage.querySelectorAll<HTMLElement>("[data-table-seat]")];
    const measure = () => {
      let tallest = 0;
      for (const element of elements) {
        const height = element.offsetHeight;
        element.style.setProperty("--seat-height", `${height}px`);
        tallest = Math.max(tallest, height);
      }
      stage.style.setProperty("--seat-clearance", `${tallest + 16}px`);
    };
    const observer = new ResizeObserver(measure);
    elements.forEach((element) => observer.observe(element));
    measure();
    return () => observer.disconnect();
  }, [seatIds, meId]);
  const previousStake = useRef(stake);
  const [chipFlight, setChipFlight] = useState(0);
  useEffect(() => {
    if (stake > previousStake.current) setChipFlight((value) => value + 1);
    previousStake.current = stake;
  }, [stake]);
  const meIdx = seats.findIndex((s) => s.id === meId);
  // Opponents, clockwise from the viewer's left neighbour.
  const opponents: StageSeat[] =
    meIdx >= 0
      ? Array.from({ length: seats.length - 1 }, (_, k) => seats[(meIdx + 1 + k) % seats.length]!)
      : seats;
  const positions = SEAT_POS[opponents.length] ?? fallbackArc(opponents.length);

  return (
    <div className={`table-layout integrated-table${selfCurrent ? " local-turn" : ""}`}>
      <section
        ref={stageRef}
        className={`table-stage${className ? ` ${className}` : ""}`}
        data-count={seats.length}
        data-testid={testId}
      >
        <div className="table-felt" aria-hidden />
        <span className="table-watermark" aria-hidden>G / T</span>
        {chipFlight > 0 && <span key={chipFlight} className="flying-chip" aria-hidden />}

        {center && <div className="table-center">{center}</div>}

        {opponents.map((seat, i) => {
          const [left, top] = positions[i] ?? [50, 15];
          const cls = ["table-seat", seat.current ? "current" : "", seat.dimmed ? "dimmed" : ""]
            .filter(Boolean)
            .join(" ");
          return (
            <div key={seat.id} className={cls} data-table-seat style={{
              left: `clamp(2.75rem, ${left}%, calc(100% - 2.75rem))`,
              top: `clamp(calc(var(--seat-height, 0px) / 2 + 8px), ${top}%, calc(100% - var(--seat-height, 0px) / 2 - 8px))`,
            }}>
              {seat.content}
            </div>
          );
        })}
      </section>

      {(self || actions) && (
        <div className={`self-bar${selfCurrent ? " current" : ""}`}>
          <div className="table-bank" aria-label={bankroll === undefined ? undefined : `${bankroll} jetons`}>
            <div className="table-stack-discs" aria-hidden>{Array.from({ length: 8 }, (_, i) => <span key={i} />)}</div>
            {bankroll !== undefined && <><strong>{bankroll.toLocaleString("fr-FR")}</strong><small>TES JETONS</small></>}
          </div>
          <div className="table-self"><div className="table-turn-label" role="status">{status ?? (selfCurrent ? "À toi de jouer" : "En cours")}</div>{self}</div>
          {actions && <div className="table-controls">{actions}</div>}
        </div>
      )}
    </div>
  );
}
