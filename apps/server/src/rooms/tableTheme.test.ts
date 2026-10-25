import { describe, expect, it } from "vitest";
import { RoomManager } from "./roomManager";

describe("shared table appearance", () => {
  it("keeps the host's choice for late joiners and between games", () => {
    const rooms = new RoomManager();
    const initial = rooms.createRoom("host", "Alice");
    expect(initial.tableTheme).toBe("wine");
    expect(rooms.setTableTheme("host", "night").ok).toBe(true);
    const joined = rooms.joinRoom("guest", initial.code, "Bob");
    expect(joined.ok && joined.room.tableTheme).toBe("night");
    expect(rooms.startGame("host", { game: "blackjack", settings: {} }).ok).toBe(true);
    expect(rooms.endGame("host")?.room.tableTheme).toBe("night");
  });

  it("rejects non-host and invalid runtime inputs without changing the table", () => {
    const rooms = new RoomManager();
    const { code } = rooms.createRoom("host", "Alice");
    rooms.joinRoom("guest", code, "Bob");
    expect(rooms.setTableTheme("guest", "forest")).toEqual({ ok: false, error: "NOT_HOST" });
    for (const invalid of [null, undefined, {}, ["night"], "__proto__", "url(untrusted)"]) {
      expect(rooms.setTableTheme("host", invalid)).toEqual({ ok: false, error: "INVALID_THEME" });
    }
    expect(rooms.roomStateByCode(code)?.tableTheme).toBe("wine");
    expect(rooms.setTableTheme("outside", "night")).toEqual({ ok: false, error: "NO_ROOM" });
  });

  it("preserves the theme while transferring control when the host leaves", () => {
    const rooms = new RoomManager();
    const { code } = rooms.createRoom("host", "Alice");
    rooms.joinRoom("guest", code, "Bob");
    rooms.setTableTheme("host", "forest");
    expect(rooms.leaveRoom("host")?.room?.tableTheme).toBe("forest");
    expect(rooms.setTableTheme("guest", "night").ok).toBe(true);
    expect(rooms.roomStateByCode(code)?.tableTheme).toBe("night");
  });
});
