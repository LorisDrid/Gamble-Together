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
  WRONG_PHASE: "Action impossible pour le moment.",
  NOT_YOUR_TURN: "Ce n'est pas ton tour.",
  UNKNOWN_PLAYER: "Joueur inconnu.",
  INVALID_BET: "Mise invalide.",
  ALREADY_BET: "Tu as déjà misé.",
  CANNOT_REBUY: "Recharge impossible pour le moment.",
};
