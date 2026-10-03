import { create } from "zustand";

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  avatarId: string;
}

export interface SessionHistoryItem {
  sessionId: string;
  roomCode: string;
  startedAt: string;
  endedAt: string;
  rounds: number;
  displayName: string;
  totalBuyIn: number;
  finalStack: number;
  net: number;
  roundsPlayed: number;
}

export interface CareerStats {
  totalSessions: number;
  totalRounds: number;
  totalNet: number;
  winningSessions: number;
}

export interface AuthState {
  user: AuthUser | null;
  userToken: string | null;
  isLoading: boolean;
  error: string | null;
  history: SessionHistoryItem[];
  careerStats: CareerStats | null;

  checkAuth: () => Promise<void>;
  login: (email: string, pass: string) => Promise<boolean>;
  register: (email: string, username: string, pass: string, avatarId?: string) => Promise<boolean>;
  logout: () => Promise<void>;
  fetchMySessions: () => Promise<void>;
  clearError: () => void;
}

const STORAGE_KEYS = {
  USER_TOKEN: "felt_auth_token",
  SAVED_USER: "felt_saved_user",
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  userToken:
    typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEYS.USER_TOKEN) : null,
  isLoading: false,
  error: null,
  history: [],
  careerStats: null,

  clearError: () => set({ error: null }),

  checkAuth: async () => {
    try {
      const res = await fetch("/api/auth/me", {
        headers: get().userToken ? { Authorization: `Bearer ${get().userToken}` } : {},
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.ok && data.user) {
        set({ user: data.user });
      }
    } catch {
      // Offline / guest
    }
  },

  login: async (email: string, pass: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: pass }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        if (data.token) {
          localStorage.setItem(STORAGE_KEYS.USER_TOKEN, data.token);
        }
        set({ user: data.user, userToken: data.token, isLoading: false });
        return true;
      }
      set({ error: data.error || "Login failed", isLoading: false });
      return false;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Network error";
      set({ error: message, isLoading: false });
      return false;
    }
  },

  register: async (email: string, username: string, pass: string, avatarId = "lion") => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, username, password: pass, avatarId }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        if (data.token) {
          localStorage.setItem(STORAGE_KEYS.USER_TOKEN, data.token);
        }
        set({ user: data.user, userToken: data.token, isLoading: false });
        return true;
      }
      set({ error: data.error || "Registration failed", isLoading: false });
      return false;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Network error";
      set({ error: message, isLoading: false });
      return false;
    }
  },

  logout: async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore
    }
    localStorage.removeItem(STORAGE_KEYS.USER_TOKEN);
    set({ user: null, userToken: null, history: [], careerStats: null });
  },

  fetchMySessions: async () => {
    const { userToken } = get();
    if (!userToken) return;

    try {
      const res = await fetch("/api/sessions/my", {
        headers: { Authorization: `Bearer ${userToken}` },
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        set({ history: data.sessions, careerStats: data.stats });
      }
    } catch {
      // Ignore
    }
  },
}));
