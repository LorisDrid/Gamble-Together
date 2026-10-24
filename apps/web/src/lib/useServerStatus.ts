"use client";

import { useEffect, useState } from "react";

import { getSocket } from "./socket";

export type ServerStatus = "connected" | "connecting" | "waking";

/**
 * On the free hosting tier the server sleeps after ~15 min idle, so the first
 * connection can hang up to ~1 min while it spins up. We surface that: while the
 * socket isn't connected we report "connecting", and once the wait passes a
 * short grace we escalate to "waking" so the UI can explain the delay instead of
 * looking frozen.
 */
const WAKING_AFTER_MS = 3500;

export function useServerStatus(): ServerStatus {
  const [status, setStatus] = useState<ServerStatus>("connecting");

  useEffect(() => {
    const socket = getSocket();
    let wakingTimer: ReturnType<typeof setTimeout> | undefined;

    const armWakingTimer = () => {
      clearTimeout(wakingTimer);
      wakingTimer = setTimeout(() => setStatus("waking"), WAKING_AFTER_MS);
    };

    const onConnect = () => {
      clearTimeout(wakingTimer);
      setStatus("connected");
    };
    const onDisconnect = () => {
      setStatus("connecting");
      armWakingTimer();
    };

    if (socket.connected) {
      setStatus("connected");
    } else {
      setStatus("connecting");
      armWakingTimer();
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    return () => {
      clearTimeout(wakingTimer);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  return status;
}
