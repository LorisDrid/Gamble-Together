"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { GameStateView, RoomState } from "@gamble/shared";

import { getSocket } from "@/lib/socket";
import { ROOM_ERROR_MESSAGES } from "@/lib/messages";
import { GamePicker } from "@/components/GamePicker";
import { BlackjackTable } from "@/components/BlackjackTable";
import { RouletteTable } from "@/components/RouletteTable";
import { PokerTable } from "@/components/PokerTable";

export default function TablePage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const code = params.code.toUpperCase();

  const [room, setRoom] = useState<RoomState | null>(null);
  const [game, setGame] = useState<GameStateView | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const nickname = localStorage.getItem("nickname");
    if (!nickname) {
      router.replace("/");
      return;
    }

    const socket = getSocket();
    const onRoomState = (state: RoomState) => {
      setRoom(state);
      if (!state.activeGame) setGame(null);
    };
    const onGameState = (state: GameStateView) => setGame(state);
    socket.on("room:state", onRoomState);
    socket.on("game:state", onGameState);

    // Idempotent on the server: re-joining the room we are already in
    // (after creating it, or on page refresh) just returns its state.
    socket.emit("room:join", { code, nickname }, (res) => {
      if (res.ok) {
        setRoom(res.room);
        setPlayerId(res.playerId);
      } else {
        setError(ROOM_ERROR_MESSAGES[res.error]);
      }
    });

    return () => {
      socket.off("room:state", onRoomState);
      socket.off("game:state", onGameState);
    };
  }, [code, router]);

  function leaveTable() {
    getSocket().emit("room:leave");
    router.push("/");
  }

  async function copyCode() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (error) {
    return (
      <main>
        <h1>Gamble Together</h1>
        <p className="error">{error}</p>
        <button className="secondary" onClick={() => router.push("/")}>
          Retour à l’accueil
        </button>
      </main>
    );
  }

  if (!room) {
    return (
      <main>
        <h1>Gamble Together</h1>
        <p className="tagline">Connexion à la table…</p>
      </main>
    );
  }

  const isHost = room.players.some((p) => p.id === playerId && p.isHost);

  return (
    <main className={game ? "wide" : undefined}>
      <h1>Gamble Together</h1>

      {game && playerId ? (
        game.game === "blackjack" ? (
          <BlackjackTable view={game.view} playerId={playerId} isHost={isHost} />
        ) : game.game === "roulette" ? (
          <RouletteTable view={game.view} playerId={playerId} isHost={isHost} />
        ) : (
          <PokerTable view={game.view} playerId={playerId} isHost={isHost} />
        )
      ) : (
        <>
          <div className="panel">
            <label>Code de la table — partage-le avec tes amis</label>
            <div className="room-code">{room.code}</div>
            <button className="secondary" onClick={copyCode}>
              {copied ? "Code copié !" : "Copier le code"}
            </button>
          </div>

          <div className="panel">
            <label>
              Joueurs à la table ({room.players.length}/{room.maxPlayers})
            </label>
            <ul className="players">
              {room.players.map((player) => (
                <li key={player.id}>
                  <span>
                    {player.nickname}
                    {player.id === playerId && " (toi)"}
                  </span>
                  {player.isHost && <span className="badge">Hôte</span>}
                </li>
              ))}
            </ul>
          </div>

          {isHost ? (
            <GamePicker />
          ) : (
            <div className="panel">
              <p className="tagline">En attente que l’hôte lance un jeu…</p>
            </div>
          )}
        </>
      )}

      <div className="panel">
        <button className="secondary" onClick={leaveTable}>
          Quitter la table
        </button>
      </div>
    </main>
  );
}
