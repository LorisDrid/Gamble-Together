"use client";

import { useEffect, useState } from "react";
import type { GameKind } from "@gamble/shared";

const RULES: Record<GameKind, { title: string; rules: string[] }> = {
  blackjack: {
    title: "Blackjack",
    rules: [
      "But : avoir une main plus forte que celle du croupier sans dépasser 21.",
      "Valeurs : les cartes 2 à 10 valent leur chiffre, les figures valent 10, l'As vaut 11 ou 1 (automatique).",
      "Chacun place sa mise, puis reçoit 2 cartes. Le croupier en a une face cachée.",
      "À ton tour : « Tirer » pour une carte de plus, « Rester » pour t'arrêter.",
      "Au-delà de 21, tu « bust » : mise perdue, même si le croupier dépasse ensuite.",
      "Le croupier tire jusqu'à 17 et reste sur tous les 17.",
      "Gains : victoire payée 1 contre 1 ; Blackjack (21 avec 2 cartes) payé 3 contre 2 ; égalité = mise rendue.",
    ],
  },
  roulette: {
    title: "Roulette",
    rules: [
      "Roulette européenne : numéros 0 à 36, un seul zéro.",
      "Mises possibles : Rouge ou Noir, Pair ou Impair (payées 1 contre 1), Numéro plein (payé 35 contre 1).",
      "Tu peux cumuler plusieurs mises, puis « Valider mes mises » — ou « Passer ce tour » sans miser.",
      "« Tout annuler » rembourse tes mises tant que tu n'as pas validé.",
      "La roue tourne automatiquement quand tout le monde a validé.",
      "Le zéro fait perdre toutes les mises Rouge/Noir et Pair/Impair : c'est l'avantage de la maison.",
    ],
  },
  poker: {
    title: "Poker — Texas Hold'em",
    rules: [
      "Chacun reçoit 2 cartes privées ; 5 cartes communes sont révélées au centre (flop, turn, river).",
      "But : faire la meilleure main de 5 cartes — ou faire coucher tout le monde.",
      "Les blinds (petite et grosse) sont misées d'office ; le bouton « D » du donneur tourne à chaque main.",
      "À ton tour : se coucher, parole (si rien à suivre), suivre, ou relancer — no-limit : jusqu'à ton tapis.",
      "Tapis (all-in) : tu peux tout miser ; les pots secondaires se calculent automatiquement.",
      "Une mise relancée rouvre la parole des autres joueurs ; les mises non suivies sont remboursées.",
      "Classement des mains, de la plus forte à la plus faible : Quinte flush, Carré, Full, Couleur, Quinte, Brelan, Double paire, Paire, Carte haute.",
    ],
  },
};

/** Extra rules shown only when a blackjack table is running in Sabotage mode. */
const SABOTAGE_RULES = [
  "Mode Sabotage : en tirant une figure, elle peut devenir une carte Saboteur (≈ 35 %) qui te donne aussitôt un pouvoir à lancer.",
  "🗡️ Valet : applique un ±1 au total d'une main — la tienne, celle d'un adversaire ou celle du croupier.",
  "👑 Dame : échange une de tes cartes contre celle d'un adversaire.",
  "♚ Roi : force le croupier à tirer une carte de plus en fin de manche (au risque de le faire sauter).",
  "🛡️ As : bouclier secret qui bloque le sabotage adverse — invisible tant qu'il n'a rien bloqué.",
  "Une carte spéciale reste cachée des autres jusqu'à ce que tu l'utilises, et tu n'as qu'un pouvoir par manche.",
];

/** Floating "?" tab (top right) that opens the rules of the current game. */
export function RulesHelp({ game, sabotage = false }: { game: GameKind; sabotage?: boolean }) {
  const [open, setOpen] = useState(false);
  const base = RULES[game];
  const withSabotage = sabotage && game === "blackjack";
  const title = withSabotage ? "Blackjack Sabotage" : base.title;
  const rules = withSabotage ? [...base.rules, ...SABOTAGE_RULES] : base.rules;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        className="help-tab"
        aria-label={`Règles — ${title}`}
        title="Règles du jeu"
        onClick={() => setOpen(true)}
      >
        ?
      </button>

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div
            className="menu-card modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Règles — ${title}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="row">
              <h2>Règles — {title}</h2>
              <button className="icon-btn" aria-label="Fermer" onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>
            <ul className="rules-list">
              {rules.map((rule, i) => (
                <li key={i}>{rule}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
