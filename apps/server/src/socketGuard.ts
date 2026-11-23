import type { ClientToServerEvents } from "@gamble/shared";

/**
 * For each client event, how many arguments come before its acknowledgement
 * callback (null: the event takes no callback). Typed against the contract, so
 * adding an event without listing it here fails to compile.
 */
export const ACK_POSITION: Record<keyof ClientToServerEvents, number | null> = {
  "profile:sync": 1,
  "leaderboard:get": 1,
  "room:create": 1,
  "room:join": 1,
  "room:leave": null,
  "room:theme": 1,
  "room:turnTimer": 1,
  "game:start": 1,
  "tournament:start": 1,
  "game:end": null,
  "blackjack:bet": 1,
  "blackjack:hit": 0,
  "blackjack:stand": 0,
  "blackjack:double": 0,
  "blackjack:split": 0,
  "blackjack:rebuy": 0,
  "blackjack:nextRound": 0,
  "blackjack:power": 1,
  "blackjack:skipPower": 0,
  "roulette:bet": 1,
  "roulette:clearBets": 0,
  "roulette:ready": 0,
  "roulette:rebuy": 0,
  "roulette:nextRound": 0,
  "poker:fold": 0,
  "poker:check": 0,
  "poker:call": 0,
  "poker:raise": 1,
  "poker:nextHand": 0,
  "poker:rebuy": 0,
  "president:play": 1,
  "president:pass": 0,
  "president:exchange": 1,
  "president:nextRound": 0,
  "baccarat:bet": 1,
  "baccarat:clearBets": 0,
  "baccarat:ready": 0,
  "baccarat:rebuy": 0,
  "baccarat:nextRound": 0,
  "liarsdice:bid": 2,
  "liarsdice:challenge": 0,
  "liarsdice:nextRound": 0,
};

/**
 * Whether an incoming message has the shape its handler relies on: a known
 * event, and its callback exactly where the handler will call it. Handlers
 * still validate the values themselves; this only rules out messages that
 * would make them throw before they get the chance.
 */
export function isWellFormed(event: unknown, args: readonly unknown[]): boolean {
  if (typeof event !== "string" || !Object.hasOwn(ACK_POSITION, event)) return false;
  const position = ACK_POSITION[event as keyof ClientToServerEvents];
  if (position === null) return true;
  return args.length === position + 1 && typeof args[position] === "function";
}
