export interface AvatarOption {
  id: string;
  emoji: string;
  name: string;
}

export const AVATAR_OPTIONS: AvatarOption[] = [
  { id: "lion", emoji: "🦁", name: "Lion" },
  { id: "fox", emoji: "🦊", name: "Fox" },
  { id: "bear", emoji: "🐻", name: "Bear" },
  { id: "wolf", emoji: "🐺", name: "Wolf" },
  { id: "tiger", emoji: "🐯", name: "Tiger" },
  { id: "owl", emoji: "🦉", name: "Owl" },
  { id: "eagle", emoji: "🦅", name: "Eagle" },
  { id: "crown", emoji: "👑", name: "Crown" },
  { id: "gem", emoji: "💎", name: "Diamond" },
  { id: "clover", emoji: "🍀", name: "Clover" },
  { id: "spade", emoji: "♠️", name: "Spade" },
  { id: "fire", emoji: "🔥", name: "Flame" },
];

export function getAvatarEmoji(avatarId: string): string {
  const found = AVATAR_OPTIONS.find((a) => a.id === avatarId);
  return found ? found.emoji : "👤";
}
