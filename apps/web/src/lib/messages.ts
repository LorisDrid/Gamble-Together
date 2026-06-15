import type { GameAckError, RoomError } from "@gamble/shared";

export const ROOM_ERROR_MESSAGES: Record<RoomError, string> = {
  ROOM_NOT_FOUND: "Table introuvable. Vérifie le code.",
  ROOM_FULL: "Cette table est pleine.",
  INVALID_NICKNAME: "Pseudo invalide.",
};

export const GAME_ERROR_MESSAGES: Record<GameAckError, string> = {
  NO_ROOM: "Tu n'es pas à une table.",
  NO_GAME: "Aucune partie en cours.",
  NOT_HOST: "Seul l'hôte peut faire ça.",
  GAME_IN_PROGRESS: "Une partie est déjà en cours.",
  NOT_ENOUGH_GAMES: "Choisis au moins 2 jeux pour un tournoi.",
  WRONG_PHASE: "Action impossible pour le moment.",
  NOT_YOUR_TURN: "Ce n'est pas ton tour.",
  CANNOT_ACT: "Tu as déjà terminé cette manche.",
  UNKNOWN_PLAYER: "Joueur inconnu.",
  INVALID_BET: "Mise invalide.",
  ALREADY_BET: "Tu as déjà misé.",
  ALREADY_READY: "Tes mises sont déjà validées.",
  CANNOT_REBUY: "Recharge impossible pour le moment.",
  INVALID_RAISE: "Relance invalide.",
  CANNOT_CHECK: "Impossible de checker : il y a une mise à suivre.",
  NOT_ENOUGH_PLAYERS: "Pas assez de joueurs pour lancer cette partie.",
  NO_POWER: "Tu n'as pas de pouvoir à utiliser.",
  INVALID_POWER: "Pouvoir invalide.",
  INVALID_TARGET: "Cible invalide.",
  NOT_IN_HAND: "Tu n'as pas ces cartes.",
  INVALID_COMBO: "Combinaison invalide.",
  CANNOT_BEAT: "Tes cartes ne battent pas le tas.",
  CANNOT_PASS_LEAD: "Tu mènes : tu dois jouer.",
  NO_RETURN_OWED: "Tu n'as pas de carte à rendre.",
  WRONG_COUNT: "Mauvais nombre de cartes.",
};
