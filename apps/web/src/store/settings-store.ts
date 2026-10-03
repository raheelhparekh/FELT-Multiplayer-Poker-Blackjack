import { create } from "zustand";
import { type SoundSettings, soundEngine } from "../audio/sound-engine";

export type ThemeName = "classic-green" | "dark-luxury";

export interface UserSettingsState {
  theme: ThemeName;
  fourColorDeck: boolean;
  animationSpeed: number; // 1, 1.5, 2, or 0 (off)
  sound: SoundSettings;

  setTheme: (theme: ThemeName) => void;
  setFourColorDeck: (enabled: boolean) => void;
  setAnimationSpeed: (speed: number) => void;
  updateSound: (partial: Partial<SoundSettings>) => void;
}

const STORAGE_KEYS = {
  THEME: "felt_theme",
  FOUR_COLOR: "felt_four_color",
  ANIM_SPEED: "felt_animation_speed",
};

export const useSettingsStore = create<UserSettingsState>((set) => {
  // Check prefers-reduced-motion
  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const savedTheme = (localStorage.getItem(STORAGE_KEYS.THEME) as ThemeName) || "classic-green";
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
      localStorage.setItem(STORAGE_KEYS.THEME, theme);
      if (typeof document !== "undefined") {
        document.documentElement.setAttribute("data-theme", theme);
      }
      set({ theme });
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
