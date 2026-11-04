import { describe, expect, it } from "vitest";

import { RoomManager } from "./roomManager";

const TOKEN_A = "token-of-device-a";
const TOKEN_B = "token-of-device-b";

/** A room hosted by socket "a1" (device A), joined by socket "b1" (device B). */
function tableOfTwo(rooms: RoomManager): string {
  const { code } = rooms.createRoom("a1", "Alice", TOKEN_A);
  const joined = rooms.joinRoom("b1", code, "Bob", TOKEN_B);
  if (!joined.ok) throw new Error(joined.error);
  return code;
}

function playerOf(rooms: RoomManager, code: string, id: string) {
  return rooms.roomStateByCode(code)?.players.find((p) => p.id === id);
}

describe("seat recovery", () => {
  it("gives a returning device its seat, chips and host role back under a new socket", () => {
    const rooms = new RoomManager();
    const code = tableOfTwo(rooms);
    expect(rooms.startGame("a1", { game: "blackjack", settings: {} }).ok).toBe(true);
    const bet = rooms.withBlackjack("b1")!;
    expect(bet.game.placeBet(bet.playerId, 100).ok).toBe(true);

    const dropped = rooms.markDisconnected("a1");
    expect(dropped?.playerId).toBe("a1");
    expect(playerOf(rooms, code, "a1")?.connected).toBe(false);
    expect(rooms.withBlackjack("a1")).toBeNull();

    const back = rooms.joinRoom("a2", code, "Alice", TOKEN_A);
    expect(back).toMatchObject({ ok: true, playerId: "a1" });
    expect(playerOf(rooms, code, "a1")).toMatchObject({ connected: true, isHost: true });

    // Same seat in the running game: no duplicate, and actions resolve to it
    const context = rooms.withBlackjack("a2")!;
    expect(context.playerId).toBe("a1");
    expect(context.game.getView().players.map((p) => p.id)).toEqual(["a1", "b1"]);
    expect(context.game.placeBet(context.playerId, 50).ok).toBe(true);
  });

  it("takes the seat back even when the room is full", () => {
    const rooms = new RoomManager();
    const { code } = rooms.createRoom("a1", "Alice", TOKEN_A);
    for (let i = 2; i <= 6; i++) rooms.joinRoom(`p${i}`, code, `P${i}`, `token-of-player-${i}`);

    rooms.markDisconnected("a1");
    expect(rooms.joinRoom("late", code, "Late", "token-of-a-newcomer")).toEqual({
      ok: false,
      error: "ROOM_FULL",
    });
    expect(rooms.joinRoom("a2", code, "Alice", TOKEN_A)).toMatchObject({ ok: true, playerId: "a1" });
  });

  it("seats a different device separately", () => {
    const rooms = new RoomManager();
    const code = tableOfTwo(rooms);
    rooms.markDisconnected("a1");
    expect(rooms.joinRoom("c1", code, "Cara", "token-of-device-c")).toMatchObject({
      ok: true,
      playerId: "c1",
    });
  });

  it("never seats two token-less players on the same seat", () => {
    const rooms = new RoomManager();
    const { code } = rooms.createRoom("a1", "Alice");
    expect(rooms.joinRoom("b1", code, "Bob")).toMatchObject({ ok: true, playerId: "b1" });
    expect(rooms.roomStateByCode(code)?.players).toHaveLength(2);
  });

  it("stays idempotent when the same socket joins again", () => {
    const rooms = new RoomManager();
    const code = tableOfTwo(rooms);
    rooms.markDisconnected("a1");
    rooms.joinRoom("a2", code, "Alice", TOKEN_A);
    const again = rooms.joinRoom("a2", code, "Alice", TOKEN_A);
    expect(again).toMatchObject({ ok: true, playerId: "a1" });
    expect(again.ok && again.replacedSocketId).toBeUndefined();
  });

  it("lets a newer connection replace a socket that still looks alive", () => {
    const rooms = new RoomManager();
    const code = tableOfTwo(rooms);

    const taken = rooms.joinRoom("a2", code, "Alice", TOKEN_A);
    expect(taken).toMatchObject({ ok: true, playerId: "a1", replacedSocketId: "a1" });
    expect(rooms.roomCodeOf("a1")).toBeUndefined();

    // The old socket finally dying must not take the new connection offline
    expect(rooms.markDisconnected("a1")).toBeNull();
    expect(playerOf(rooms, code, "a1")?.connected).toBe(true);
  });

  it("frees the seat when the grace period ends, and hands the host role to someone online", () => {
    const rooms = new RoomManager();
    const code = tableOfTwo(rooms);
    rooms.joinRoom("c1", code, "Cara", "token-of-device-c");
    rooms.markDisconnected("b1");
    rooms.markDisconnected("a1");

    expect(rooms.expireSeat(code, "a1")?.room?.players.map((p) => p.id)).toEqual(["b1", "c1"]);
    expect(playerOf(rooms, code, "c1")?.isHost).toBe(true);
    expect(playerOf(rooms, code, "b1")?.isHost).toBe(false);

    // Coming back too late is a normal arrival
    expect(rooms.joinRoom("a2", code, "Alice", TOKEN_A)).toMatchObject({ ok: true, playerId: "a2" });
  });

  it("removes an expired player from the running game", () => {
    const rooms = new RoomManager();
    const code = tableOfTwo(rooms);
    rooms.startGame("a1", { game: "blackjack", settings: {} });
    rooms.markDisconnected("b1");
    rooms.expireSeat(code, "b1");
    expect(rooms.withBlackjack("a1")?.game.getView().players.map((p) => p.id)).toEqual(["a1"]);
  });

  it("does not expire a seat whose owner came back", () => {
    const rooms = new RoomManager();
    const code = tableOfTwo(rooms);
    rooms.markDisconnected("b1");
    rooms.joinRoom("b2", code, "Bob", TOKEN_B);
    expect(rooms.expireSeat(code, "b1")).toBeNull();
    expect(playerOf(rooms, code, "b1")?.connected).toBe(true);
  });

  it("deletes the room only once the last held seat expires", () => {
    const rooms = new RoomManager();
    const { code } = rooms.createRoom("a1", "Alice", TOKEN_A);
    rooms.markDisconnected("a1");
    expect(rooms.roomStateByCode(code)).not.toBeNull();
    expect(rooms.expireSeat(code, "a1")).toEqual({ code, room: null });
    expect(rooms.roomStateByCode(code)).toBeNull();
  });

  it("keeps a voluntary departure immediate", () => {
    const rooms = new RoomManager();
    const code = tableOfTwo(rooms);
    expect(rooms.leaveRoom("b1")?.room?.players.map((p) => p.id)).toEqual(["a1"]);
    expect(rooms.tokenOf(code, "b1")).toBeUndefined();
  });

  it("still credits a returning player's device, and never exposes the token", () => {
    const rooms = new RoomManager();
    const code = tableOfTwo(rooms);
    rooms.markDisconnected("a1");
    rooms.joinRoom("a2", code, "Alice", TOKEN_A);

    expect(rooms.tokenOf(code, "a1")).toBe(TOKEN_A);
    expect(JSON.stringify(rooms.roomStateByCode(code))).not.toContain("token-of-device");
  });
});
