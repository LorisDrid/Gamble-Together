"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { DEFAULT_TURN_TIMER, TURN_TIMER_OPTIONS } from "@gamble/shared";
import type {
  GameAck,
  GameStateView,
  RoomState,
  TableTheme,
  TournamentView,
  TurnTimerSeconds,
  TurnTimerView,
} from "@gamble/shared";

import { getSocket } from "@/lib/socket";
import { GAME_ERROR_MESSAGES, ROOM_ERROR_MESSAGES } from "@/lib/messages";
import { GamePicker } from "@/components/GamePicker";
import { BlackjackTable } from "@/components/BlackjackTable";
import { RouletteTable } from "@/components/RouletteTable";
import { PokerTable } from "@/components/PokerTable";
import { RulesHelp } from "@/components/RulesHelp";
import { PresidentTable } from "@/components/PresidentTable";
import { BaccaratTable } from "@/components/BaccaratTable";
import { LiarsDiceTable } from "@/components/LiarsDiceTable";
import { OfflinePlayersContext } from "@/components/OfflinePlayers";
import { TournamentBanner, TournamentOverlay } from "@/components/Tournament";
import { TurnClockContext, type TurnClock } from "@/components/TurnTimer";

export default function TablePage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const code = params.code.toUpperCase();

  const [room, setRoom] = useState<RoomState | null>(null);
  const [game, setGame] = useState<GameStateView | null>(null);
  const [tournament, setTournament] = useState<TournamentView | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [settingError, setSettingError] = useState<string | null>(null);
  const [changingSetting, setChangingSetting] = useState(false);
  const [turnClock, setTurnClock] = useState<TurnClock | null>(null);

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
    const onTournament = (view: TournamentView | null) => setTournament(view);
    const onTurnTimer = (timer: TurnTimerView | null) =>
      setTurnClock(timer && { deadline: Date.now() + timer.remainingMs, playerIds: timer.playerIds });
    socket.on("room:state", onRoomState);
    socket.on("game:state", onGameState);
    socket.on("tournament:state", onTournament);
    socket.on("turn:timer", onTurnTimer);

    let replaced = false;
    // Idempotent on the server: re-joining the room we are already in (after
    // creating it) just returns its state. On every new connection (page refresh,
    // network drop) the device token gives us our seat back.
    const join = () => {
      if (replaced) return;
      socket.emit("room:join", { code, nickname }, (res) => {
        if (res.ok) {
          setRoom(res.room);
          setPlayerId(res.playerId);
          // The game may have ended while we were away
          if (!res.room.activeGame) setGame(null);
        } else {
          setError(ROOM_ERROR_MESSAGES[res.error]);
        }
      });
    };
    const onReplaced = () => {
      replaced = true;
      setError("Cette table est maintenant ouverte ailleurs (autre onglet ou appareil).");
    };
    socket.on("connect", join);
    socket.on("session:replaced", onReplaced);
    if (socket.connected) join();

    return () => {
      socket.off("room:state", onRoomState);
      socket.off("game:state", onGameState);
      socket.off("tournament:state", onTournament);
      socket.off("turn:timer", onTurnTimer);
      socket.off("connect", join);
      socket.off("session:replaced", onReplaced);
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
  function settingAck(failure: string) {
    setChangingSetting(true);
    setSettingError(null);
    return (err: Error | null, res: GameAck) => {
      setChangingSetting(false);
      if (err) setSettingError(failure);
      else if (!res.ok) setSettingError(GAME_ERROR_MESSAGES[res.error]);
    };
  }
  function changeTheme(theme: TableTheme) {
    const ack = settingAck("Le tapis n’a pas pu être changé. Réessaie.");
    getSocket().timeout(5000).emit("room:theme", theme, ack);
  }
  function changeTurnTimer(seconds: TurnTimerSeconds) {
    const ack = settingAck("Le temps par tour n’a pas pu être changé. Réessaie.");
    getSocket().timeout(5000).emit("room:turnTimer", seconds, ack);
  }
  const turnTimerSetting = (
    <label className="table-theme-label">Temps par tour{isHost ? " · hôte" : ""}
      <select aria-label="Temps par tour" value={room.turnTimer ?? DEFAULT_TURN_TIMER} disabled={!isHost || changingSetting}
        onChange={(event) => changeTurnTimer(Number(event.target.value) as TurnTimerSeconds)}>
        {TURN_TIMER_OPTIONS.map((seconds) => (
          <option key={seconds} value={seconds}>{seconds === 0 ? "Désactivé" : `${seconds} s`}</option>
        ))}
      </select>
    </label>
  );
  // In a tournament, stay in the in-game view through intermissions (game is null then)
  const inTournament = room.tournamentActive && tournament !== null;
  const showOverlay = inTournament && tournament.phase !== "playing";
  const offlinePlayers = new Set(room.players.filter((p) => p.connected === false).map((p) => p.id));

  if (playerId && (game || inTournament)) {
    return (
      <OfflinePlayersContext.Provider value={offlinePlayers}>
      <TurnClockContext.Provider value={turnClock}>
      <main className="wide game-screen" data-table-theme={room.tableTheme ?? "wine"}>
        <button className="quit-tab" onClick={leaveTable}>
          ← Quitter
        </button>
        {game && !showOverlay && (
          <RulesHelp
            game={game.game}
            sabotage={game.game === "blackjack" && game.view.settings.sabotage}
          />
        )}
        <header className="game-header">
          <div><h1>Gamble <span className="accent">Together</span></h1>
            <span className="table-meta">Table {code} · {room.players.length} joueurs · Jetons fictifs</span></div>
          <div className="table-settings">
          {turnTimerSetting}
          <label className="table-theme-label">Tapis{isHost ? " · hôte" : ""}
            <select aria-label="Tapis de la table" value={room.tableTheme ?? "wine"} disabled={!isHost || changingSetting}
              onChange={(event) => changeTheme(event.target.value as TableTheme)}>
              <option value="wine">Velours bordeaux</option><option value="forest">Club vert</option><option value="night">Bleu de nuit</option>
            </select>
          </label>
          </div>
        </header>
        {settingError && <p className="error" role="alert">{settingError}</p>}
        <p className="rotate-hint">↻ Passe en paysage pour profiter de toute la table.</p>

        {inTournament && <TournamentBanner view={tournament} />}

        {showOverlay ? (
          <TournamentOverlay view={tournament} isHost={isHost} />
        ) : game ? (
          game.game === "blackjack" ? (
            <BlackjackTable view={game.view} playerId={playerId} />
          ) : game.game === "roulette" ? (
            <RouletteTable view={game.view} playerId={playerId} />
          ) : game.game === "poker" ? (
            <PokerTable view={game.view} playerId={playerId} />
          ) : game.game === "president" ? (
            <PresidentTable view={game.view} playerId={playerId} />
          ) : game.game === "baccarat" ? (
            <BaccaratTable view={game.view} playerId={playerId} />
          ) : (
            <LiarsDiceTable view={game.view} playerId={playerId} />
          )
        ) : (
          <p className="table-hint">Préparation du jeu…</p>
        )}
      </main>
      </TurnClockContext.Provider>
      </OfflinePlayersContext.Provider>
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
                {player.connected === false && <span className="offline-tag">Déconnecté</span>}
                {player.isHost && <span className="host-tag">♦ Hôte</span>}
              </li>
            ))}
          </ul>
          {turnTimerSetting}
          {settingError && <p className="error" role="alert">{settingError}</p>}
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
