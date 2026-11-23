import type { PendingDecision } from "./types";

/** A whole number within bounds, or the fallback when the value isn't a finite number. */
export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** A decision to wait for, or none when nobody is awaited. */
export function pending(key: string, playerIds: string[]): PendingDecision | null {
  return playerIds.length > 0 ? { key, playerIds } : null;
}

/** Tournament escalation: base × multiplier, never below 1. */
export function escalatedStake(base: number, multiplier: number): number {
  return Math.max(1, base * multiplier);
}
