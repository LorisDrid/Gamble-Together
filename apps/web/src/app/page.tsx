"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { NICKNAME_MAX_LENGTH, ROOM_CODE_LENGTH } from "@gamble/shared";

import { getSocket } from "@/lib/socket";
import { ROOM_ERROR_MESSAGES } from "@/lib/messages";

export default function HomePage() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setNickname(localStorage.getItem("nickname") ?? "");
  }, []);

  const trimmedNickname = nickname.trim();

  function saveNickname() {
    localStorage.setItem("nickname", trimmedNickname);
  }

  function createTable() {
    if (!trimmedNickname) return;
    saveNickname();
    setCreating(true);
    setError(null);
    getSocket().emit("room:create", { nickname: trimmedNickname }, (res) => {
      if (res.ok) {
        router.push(`/table/${res.room.code}`);
      } else {
        setError(ROOM_ERROR_MESSAGES[res.error]);
        setCreating(false);
      }
    });
  }

  function joinTable(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmedNickname || code.length !== ROOM_CODE_LENGTH) return;
    saveNickname();
    router.push(`/table/${code.toUpperCase()}`);
  }

  return (
    <main className="stagger home">
      <header className="hero">
        <div className="hero-suits">♠ ♥ ♣ ♦</div>
        <h1>
          Gamble <span className="accent">Together</span>
        </h1>
        <p className="tagline">Mini-jeux de casino entre amis. Jetons fictifs, zéro argent réel.</p>
      </header>

      <div className="menu-card" data-pip="♠">
        <div className="field">
          <label htmlFor="nickname">Ton pseudo</label>
          <input
            id="nickname"
            value={nickname}
            maxLength={NICKNAME_MAX_LENGTH}
            placeholder="Ex. : marcus platypus"
            onChange={(e) => setNickname(e.target.value)}
          />
        </div>
      </div>

      <div className="duo">
        <div className="menu-card pip-red" data-pip="♥">
          <h2>Créer une table</h2>
          <p className="hint">Reçois un code à 4 lettres et partage-le avec tes amis.</p>
          <button
            className="launch"
            disabled={!trimmedNickname || creating}
            onClick={createTable}
          >
            {creating ? "Création…" : "Créer une table"}
          </button>
        </div>

        <form className="menu-card pip-red" data-pip="♦" onSubmit={joinTable}>
          <h2>Rejoindre une table</h2>
          <div className="field">
            <label htmlFor="code">Code de la table</label>
            <input
              id="code"
              value={code}
              maxLength={ROOM_CODE_LENGTH}
              placeholder="Ex. : QK7N"
              style={{ textTransform: "uppercase" }}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </div>
          <button
            type="submit"
            className="secondary launch"
            disabled={!trimmedNickname || code.length !== ROOM_CODE_LENGTH}
          >
            Rejoindre
          </button>
        </form>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="hero-rule">♦</div>
      <p className="fineprint">Blackjack · Roulette · Poker — aucune somme réelle, juste l’honneur.</p>
    </main>
  );
}
