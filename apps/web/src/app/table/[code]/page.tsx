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
      <main className="stagger">
        <header className="hero">
          <div className="hero-suits">♠ ♥ ♣ ♦</div>
          <h1>
            Gamble <span className="accent">Together</span>
          </h1>
        </header>
        <p className="error">{error}</p>
        <div className="lobby-leave">
          <button className="secondary" onClick={() => router.push("/")}>
            Retour à l’accueil
          </button>
        </div>
      </main>
    );
  }

  if (!room) {
    return (
      <main>
        <header className="hero">
          <div className="hero-suits">♠ ♥ ♣ ♦</div>
          <h1>
            Gamble <span className="accent">Together</span>
          </h1>
        </header>
        <p className="tagline">Connexion à la table…</p>
      </main>
    );
  }

  const isHost = room.players.some((p) => p.id === playerId && p.isHost);

  if (game && playerId) {
    return (
      <main className="wide">
        <h1>
          Gamble <span className="accent">Together</span>
        </h1>
        {game.game === "blackjack" ? (
          <BlackjackTable view={game.view} playerId={playerId} />
        ) : game.game === "roulette" ? (
          <RouletteTable view={game.view} playerId={playerId} />
        ) : (
          <PokerTable view={game.view} playerId={playerId} />
        )}
        <div className="table-footer">
          <button className="secondary" onClick={leaveTable}>
            Quitter la table
          </button>
          {isHost && (
            <button className="ghost-btn" onClick={() => getSocket().emit("game:end")}>
              Terminer la partie pour tous
            </button>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="stagger lobby">
      <header className="hero">
        <div className="hero-suits">♠ ♥ ♣ ♦</div>
        <h1>
          Gamble <span className="accent">Together</span>
        </h1>
      </header>

      <div className="duo">
        <div className="menu-card pip-red" data-pip="♥">
          <h2>Code de la table</h2>
          <p className="hint">Partage-le avec tes amis pour qu’ils te rejoignent.</p>
          <div className="code-tiles">
            {room.code.split("").map((char, i) => (
              <span key={i}>{char}</span>
            ))}
          </div>
          <button className="secondary launch" onClick={copyCode}>
            {copied ? "Code copié !" : "Copier le code"}
          </button>
        </div>

        <div className="menu-card" data-pip="♠">
          <h2>
            Joueurs ({room.players.length}/{room.maxPlayers})
          </h2>
          <ul className="guest-list">
            {room.players.map((player) => (
              <li key={player.id}>
                <span>
                  {player.nickname}
                  {player.id === playerId && " (toi)"}
                </span>
                {player.isHost && <span className="host-tag">♦ Hôte</span>}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {isHost ? (
        <GamePicker />
      ) : (
        <div className="menu-card" data-pip="♣">
          <p className="hint">En attente que l’hôte lance un jeu…</p>
        </div>
      )}

      <div className="lobby-leave">
        <button className="secondary" onClick={leaveTable}>
          Quitter la table
        </button>
      </div>
    </main>
  );
}
