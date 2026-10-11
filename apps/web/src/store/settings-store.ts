import type { TableTheme } from "@felt/shared";
import { create } from "zustand";
import { type SoundSettings, soundEngine } from "../audio/sound-engine";

export type ThemeName = TableTheme;

export interface CasinoThemeMeta {
  id: ThemeName;
  name: string;
  feltLabel: string;
  badge: string;
  colorName: string;
  fromColor: string;
  viaColor: string;
  toColor: string;
  railColor: string;
  accentColor: string;
  swatchGradient: string;
}

export const CASINO_THEMES: CasinoThemeMeta[] = [
  {
    id: "classic-green",
    name: "Monte Carlo",
    feltLabel: "Emerald Green",
    badge: "Emerald",
    colorName: "Green",
    fromColor: "#195a32",
    viaColor: "#0f3d20",
    toColor: "#07190c",
    railColor: "#0c2214",
    accentColor: "#d4af37",
    swatchGradient: "from-emerald-700 via-emerald-900 to-black",
  },
  {
    id: "royal-blue",
    name: "Bellagio Sapphire",
    feltLabel: "Macau VIP Blue",
    badge: "Sapphire",
    colorName: "Blue",
    fromColor: "#154273",
    viaColor: "#092849",
    toColor: "#041224",
    railColor: "#071a30",
    accentColor: "#60a5fa",
    swatchGradient: "from-blue-700 via-blue-950 to-black",
  },
  {
    id: "ruby-red",
    name: "Caesars Crimson",
    feltLabel: "High Roller Red",
    badge: "Ruby",
    colorName: "Red",
    fromColor: "#6b1426",
    viaColor: "#3d0b17",
    toColor: "#1c050b",
    railColor: "#2a060e",
    accentColor: "#fb7185",
    swatchGradient: "from-rose-800 via-rose-950 to-black",
  },
  {
    id: "midnight-onyx",
    name: "Venetian Noir",
    feltLabel: "VIP Charcoal Onyx",
    badge: "Onyx",
    colorName: "Onyx",
    fromColor: "#252a33",
    viaColor: "#15181e",
    toColor: "#090a0d",
    railColor: "#0d0f13",
    accentColor: "#f0d060",
    swatchGradient: "from-zinc-700 via-zinc-900 to-black",
  },
  {
    id: "imperial-purple",
    name: "Crown Velvet",
    feltLabel: "Imperial Amethyst",
    badge: "Amethyst",
    colorName: "Purple",
    fromColor: "#4a1d6a",
    viaColor: "#2c1040",
    toColor: "#13061f",
    railColor: "#1e082b",
    accentColor: "#c084fc",
    swatchGradient: "from-purple-800 via-purple-950 to-black",
  },
];

export interface UserSettingsState {
  theme: ThemeName;
  fourColorDeck: boolean;
  animationSpeed: number; // 1, 1.5, 2, or 0 (off)
  sound: SoundSettings;

  setTheme: (theme: ThemeName) => void;
  cycleTheme: () => void;
  setFourColorDeck: (enabled: boolean) => void;
  setAnimationSpeed: (speed: number) => void;
  updateSound: (partial: Partial<SoundSettings>) => void;
}

const STORAGE_KEYS = {
  THEME: "felt_theme",
  FOUR_COLOR: "felt_four_color",
  ANIM_SPEED: "felt_animation_speed",
};

export const useSettingsStore = create<UserSettingsState>((set, get) => {
  // Check prefers-reduced-motion
  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const rawTheme =
    typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEYS.THEME) : null;
  const savedTheme: TableTheme =
    rawTheme === "dark-luxury" ? "midnight-onyx" : (rawTheme as TableTheme) || "classic-green";

  const savedFourColor = localStorage.getItem(STORAGE_KEYS.FOUR_COLOR) === "true";
  const savedSpeedStr = localStorage.getItem(STORAGE_KEYS.ANIM_SPEED);
  const initialSpeed = savedSpeedStr !== null ? Number(savedSpeedStr) : prefersReduced ? 0 : 1;

  // Apply theme class to document body
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", savedTheme);
  }

  return {
    theme: savedTheme,
    fourColorDeck: savedFourColor,
    animationSpeed: initialSpeed,
    sound: soundEngine.getSettings(),

    setTheme: (theme: ThemeName) => {
      const normalizedTheme: TableTheme =
        (theme as string) === "dark-luxury" ? "midnight-onyx" : theme;
      localStorage.setItem(STORAGE_KEYS.THEME, normalizedTheme);
      if (typeof document !== "undefined") {
        document.documentElement.setAttribute("data-theme", normalizedTheme);
      }
      set({ theme: normalizedTheme });
    },

    cycleTheme: () => {
      const current = get().theme;
      const validThemes = CASINO_THEMES.map((t) => t.id);
      const currentIndex = validThemes.indexOf(current);
      const nextIndex = (currentIndex + 1) % validThemes.length;
      const nextTheme = validThemes[nextIndex] ?? "classic-green";
      get().setTheme(nextTheme);
    },

    setFourColorDeck: (fourColorDeck: boolean) => {
      localStorage.setItem(STORAGE_KEYS.FOUR_COLOR, String(fourColorDeck));
      set({ fourColorDeck });
    },

    setAnimationSpeed: (animationSpeed: number) => {
      localStorage.setItem(STORAGE_KEYS.ANIM_SPEED, String(animationSpeed));
      set({ animationSpeed });
    },

    updateSound: (partial: Partial<SoundSettings>) => {
      soundEngine.updateSettings(partial);
      set({ sound: soundEngine.getSettings() });
    },
  };
});
