import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  LeaderboardEntry,
  LeaderboardMetric,
  PlayerProfile,
  ServerToClientEvents,
} from "@gamble/shared";

import { getPlayerToken } from "./profile";

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

let socket: GameSocket | null = null;

/** Lazily created singleton — survives client-side navigation. */
export function getSocket(): GameSocket {
  if (!socket) {
    socket = io(SERVER_URL);
    // Identify the persistent guest on every (re)connection so the server can
    // attribute round stats to this device, whatever page we're on.
    socket.on("connect", () => {
      const nickname = localStorage.getItem("nickname") ?? undefined;
      socket!.emit("profile:sync", { token: getPlayerToken(), nickname }, () => {});
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
