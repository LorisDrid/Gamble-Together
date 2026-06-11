import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@gamble/shared";

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

let socket: GameSocket | null = null;

/** Lazily created singleton — survives client-side navigation. */
export function getSocket(): GameSocket {
  if (!socket) {
    socket = io(SERVER_URL);
  }
  return socket;
}
