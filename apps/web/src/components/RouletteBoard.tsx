import type { CSSProperties } from "react";
import { numberColor } from "@gamble/shared";
import type { RouletteBet } from "@gamble/shared";

const NUMBERS = Array.from({ length: 36 }, (_, i) => i + 1);

interface RouletteBoardProps {
  bets: RouletteBet[];
  /** Chip value dropped on each click. */
  amount: number;
  disabled: boolean;
  /** Highlighted on the mat during the result phase. */
  winningNumber?: number | null;
  onBet: (bet: RouletteBet) => void;
}

/**
 * Clickable European roulette mat in the classic horizontal layout
 * (0 on the left, 3×12 number grid, 2:1 columns on the right, dozens then the
 * even-money row below), drawn in the 3-colour palette. Scrolls sideways on
 * narrow screens. Click a cell to drop a chip of the selected value.
 */
export function RouletteBoard({ bets, amount, disabled, winningNumber = null, onBet }: RouletteBoardProps) {
  const place = (bet: RouletteBet) => {
    if (!disabled) onBet(bet);
  };

  const sum = (predicate: (bet: RouletteBet) => boolean) =>
    bets.reduce((total, bet) => (predicate(bet) ? total + bet.amount : total), 0);

  const straightStake = (n: number) => sum((b) => b.kind === "straight" && b.number === n);
  const kindStake = (kind: RouletteBet["kind"]) => sum((b) => b.kind === kind);
  const dozenStake = (g: number) => sum((b) => b.kind === "dozen" && b.group === g);
  const columnStake = (c: number) => sum((b) => b.kind === "column" && b.column === c);

  const chip = (stake: number) => (stake > 0 ? <span className="rstake">{stake}</span> : null);
  const at = (gridColumn: CSSProperties["gridColumn"], gridRow: number | string): CSSProperties => ({
    gridColumn,
    gridRow,
  });
  const winClass = (n: number) => (winningNumber === n ? " win" : "");

  return (
    <div className={disabled ? "roulette-mat disabled" : "roulette-mat"}>
      <div className="mat-numbers">
        <button
          type="button"
          className={`rcell num green${winClass(0)}`}
          style={at(1, "1 / 4")}
          disabled={disabled}
          onClick={() => place({ kind: "straight", number: 0, amount })}
        >
          0{chip(straightStake(0))}
        </button>

        {NUMBERS.map((n) => {
          const rem = n % 3;
          const row = rem === 0 ? 1 : rem === 2 ? 2 : 3; // top: 3,6,9… / mid: 2,5… / bottom: 1,4…
          return (
            <button
              type="button"
              key={n}
              className={`rcell num ${numberColor(n)}${winClass(n)}`}
              style={at(Math.ceil(n / 3) + 1, row)}
              disabled={disabled}
              onClick={() => place({ kind: "straight", number: n, amount })}
            >
              {n}
              {chip(straightStake(n))}
            </button>
          );
        })}

        {/* 2:1 column bets — top row = column 3, middle = 2, bottom = 1 */}
        {([
          { row: 1, column: 3 },
          { row: 2, column: 2 },
          { row: 3, column: 1 },
        ] as const).map(({ row, column }) => (
          <button
            type="button"
            key={column}
            className="rcell side"
            style={at(14, row)}
            disabled={disabled}
            onClick={() => place({ kind: "column", column, amount })}
          >
            2:1{chip(columnStake(column))}
          </button>
        ))}
      </div>

      <div className="mat-outside">
        {/* Dozens */}
        <button type="button" className="rcell wide" style={at("2 / 6", 1)} disabled={disabled} onClick={() => place({ kind: "dozen", group: 1, amount })}>
          1-12{chip(dozenStake(1))}
        </button>
        <button type="button" className="rcell wide" style={at("6 / 10", 1)} disabled={disabled} onClick={() => place({ kind: "dozen", group: 2, amount })}>
          13-24{chip(dozenStake(2))}
        </button>
        <button type="button" className="rcell wide" style={at("10 / 14", 1)} disabled={disabled} onClick={() => place({ kind: "dozen", group: 3, amount })}>
          25-36{chip(dozenStake(3))}
        </button>

        {/* Even-money row */}
        <button type="button" className="rcell wide" style={at("2 / 4", 2)} disabled={disabled} onClick={() => place({ kind: "low", amount })}>
          1-18{chip(kindStake("low"))}
        </button>
        <button type="button" className="rcell wide" style={at("4 / 6", 2)} disabled={disabled} onClick={() => place({ kind: "even", amount })}>
          Pair{chip(kindStake("even"))}
        </button>
        <button type="button" className="rcell wide red" style={at("6 / 8", 2)} disabled={disabled} onClick={() => place({ kind: "red", amount })}>
          Rouge{chip(kindStake("red"))}
        </button>
        <button type="button" className="rcell wide black" style={at("8 / 10", 2)} disabled={disabled} onClick={() => place({ kind: "black", amount })}>
          Noir{chip(kindStake("black"))}
        </button>
        <button type="button" className="rcell wide" style={at("10 / 12", 2)} disabled={disabled} onClick={() => place({ kind: "odd", amount })}>
          Impair{chip(kindStake("odd"))}
        </button>
        <button type="button" className="rcell wide" style={at("12 / 14", 2)} disabled={disabled} onClick={() => place({ kind: "high", amount })}>
          19-36{chip(kindStake("high"))}
        </button>
      </div>
    </div>
  );
}
