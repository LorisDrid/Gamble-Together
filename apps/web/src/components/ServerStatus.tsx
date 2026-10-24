"use client";

import { useServerStatus } from "@/lib/useServerStatus";

/**
 * Non-intrusive banner shown while the socket isn't connected. On the free
 * hosting tier the server sleeps when idle, so the first connection can take up
 * to a minute — we say so rather than leaving a button frozen. Renders nothing
 * once connected.
 */
export function ServerStatus() {
  const status = useServerStatus();
  if (status === "connected") return null;

  const waking = status === "waking";
  return (
    <div className={`server-status${waking ? " waking" : ""}`} role="status" aria-live="polite">
      <span className="server-status-dot" aria-hidden />
      {waking ? (
        <span>
          Réveil du serveur{" "}
          <span className="server-status-sub">(hébergement gratuit, jusqu’à ~1&nbsp;min)…</span>
        </span>
      ) : (
        <span>Connexion au serveur…</span>
      )}
    </div>
  );
}
