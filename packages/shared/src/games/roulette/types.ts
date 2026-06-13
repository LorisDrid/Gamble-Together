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

/**
 * European single-zero bets.
 * - straight: a single number 0-36 (35:1)
 * - dozen: 1 = 1-12, 2 = 13-24, 3 = 25-36 (2:1)
 * - column: 1/2/3 vertical column (2:1)
 * - red/black/even/odd/low(1-18)/high(19-36): even-money (1:1)
 */
export type RouletteBet =
  | { kind: "straight"; number: number; amount: number }
  | { kind: "dozen"; group: 1 | 2 | 3; amount: number }
  | { kind: "column"; column: 1 | 2 | 3; amount: number }
  | { kind: "red" | "black" | "even" | "odd" | "low" | "high"; amount: number };

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
