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
    <main>
      <h1>Gamble Together</h1>
      <p className="tagline">Mini-jeux de casino entre amis. Jetons fictifs, zéro argent réel.</p>

      <div className="panel">
        <label htmlFor="nickname">Ton pseudo</label>
        <input
          id="nickname"
          value={nickname}
          maxLength={NICKNAME_MAX_LENGTH}
          placeholder="Ex. : marcus platypus"
          onChange={(e) => setNickname(e.target.value)}
        />
      </div>

      <div className="panel">
        <button disabled={!trimmedNickname || creating} onClick={createTable}>
          {creating ? "Création…" : "Créer une table"}
        </button>
      </div>

      <form className="panel" onSubmit={joinTable}>
        <label htmlFor="code">Code de la table</label>
        <input
          id="code"
          value={code}
          maxLength={ROOM_CODE_LENGTH}
          placeholder="Ex. : QK7N"
          style={{ textTransform: "uppercase" }}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <button
          type="submit"
          className="secondary"
          disabled={!trimmedNickname || code.length !== ROOM_CODE_LENGTH}
        >
          Rejoindre
        </button>
      </form>

      {error && <p className="error">{error}</p>}
    </main>
  );
}
