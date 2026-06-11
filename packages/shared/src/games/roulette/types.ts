export interface RouletteSettings {
  startingChips: number;
  minBet: number;
}

export const DEFAULT_ROULETTE_SETTINGS: RouletteSettings = {
  startingChips: 1000,
  minBet: 10,
};

/** European wheel: numbers 0-36, single zero. */
export const ROULETTE_MAX_NUMBER = 36;

export type RouletteBet =
  | { kind: "straight"; number: number; amount: number }
  | { kind: "red" | "black" | "even" | "odd"; amount: number };

export type RoulettePhase = "betting" | "result";

export interface RoulettePlayerView {
  id: string;
  nickname: string;
  chips: number;
  bets: RouletteBet[];
  ready: boolean;
  /** Net chip change of the last spin; null before the first result. */
  lastNet: number | null;
}

export interface RouletteView {
  phase: RoulettePhase;
  round: number;
  players: RoulettePlayerView[];
  /** Set during the result phase, null while betting. */
  winningNumber: number | null;
  settings: RouletteSettings;
}
