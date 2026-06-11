import type { RoomError } from "@gamble/shared";

export const ROOM_ERROR_MESSAGES: Record<RoomError, string> = {
  ROOM_NOT_FOUND: "Table introuvable. Vérifie le code.",
  ROOM_FULL: "Cette table est pleine.",
  INVALID_NICKNAME: "Pseudo invalide.",
};
