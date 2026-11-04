import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  GameAck,
  LeaderboardEntry,
  LeaderboardMetric,
  PlayerProfile,
  ServerToClientEvents,
  TournamentSettings,
} from "@gamble/shared";

import { getPlayerToken } from "./profile";

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

let socket: GameSocket | null = null;

/** Lazily created singleton — survives client-side navigation. */
export function getSocket(): GameSocket {
  if (!socket) {
    // The device token travels with every handshake: it's how the server gives a
    // reconnecting player their seat back.
    socket = io(SERVER_URL, { auth: (send) => send({ token: getPlayerToken() }) });
    // Identify the persistent guest on every (re)connection so the server can
    // attribute round stats to this device, whatever page we're on.
    socket.on("connect", () => {
      const nickname = localStorage.getItem("nickname") ?? undefined;
      socket!.emit("profile:sync", { token: getPlayerToken(), nickname }, () => {});
    });
    // The server only cuts a socket whose seat was taken over; Socket.io doesn't
    // retry on its own in that case, and this tab still needs a working connection.
    socket.on("disconnect", (reason) => {
      if (reason === "io server disconnect") socket!.connect();
    });
  }
  return socket;
}

/** Upserts the profile (optionally refreshing the nickname) and returns the stored stats. */
export function syncProfile(nickname?: string): Promise<PlayerProfile | null> {
  return new Promise((resolve) => {
    getSocket().emit("profile:sync", { token: getPlayerToken(), nickname }, resolve);
  });
}

/** Top players for the given metric (own row flagged `isMe`). */
export function getLeaderboard(metric: LeaderboardMetric): Promise<LeaderboardEntry[]> {
  return new Promise((resolve) => {
    getSocket().emit("leaderboard:get", metric, resolve);
  });
}

/** Host only: start a tournament (chained mini-games). */
export function startTournament(settings: TournamentSettings): Promise<GameAck> {
  return new Promise((resolve) => {
    getSocket().emit("tournament:start", settings, resolve);
  });
}
