import type React from "react";
import { useState } from "react";
import { useAuthStore } from "../../store/auth-store";
import { useGameStore } from "../../store/game-store";
import { AVATAR_OPTIONS } from "../../types/avatars";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [avatarId, setAvatarId] = useState("lion");

  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    const success =
      tab === "login"
        ? await login(email, password)
        : await register(email, username, password, avatarId);

    if (success) {
      // Claim user in current room if connected
      const userToken = useAuthStore.getState().userToken;
      const socket = useGameStore.getState().socket;
      if (userToken && socket) {
        socket.emit("user:claim", { userToken });
      }
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm bg-[#0c1810] border border-gold-400/40 rounded-3xl p-5 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-emerald-900/40">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setTab("login");
                clearError();
              }}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs tracking-wide transition-all ${
                tab === "login"
                  ? "bg-gold-400 text-black shadow"
                  : "text-emerald-400/70 hover:text-white"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setTab("register");
                clearError();
              }}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs tracking-wide transition-all ${
                tab === "register"
                  ? "bg-gold-400 text-black shadow"
                  : "text-emerald-400/70 hover:text-white"
              }`}
            >
              Create Account
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-emerald-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-2.5 rounded-xl bg-rose-950/80 border border-rose-700/60 text-xs text-rose-200">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label htmlFor="auth-email-input" className="block text-emerald-400 font-bold mb-1">
              Email
            </label>
            <input
              id="auth-email-input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-black/60 border border-emerald-800 rounded-xl px-3 py-2 text-white placeholder-emerald-700 focus:outline-none focus:border-gold-400"
            />
          </div>

          {tab === "register" && (
            <div>
              <label
                htmlFor="auth-username-input"
                className="block text-emerald-400 font-bold mb-1"
              >
                Username
              </label>
              <input
                id="auth-username-input"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="HighRoller"
                maxLength={30}
                className="w-full bg-black/60 border border-emerald-800 rounded-xl px-3 py-2 text-white placeholder-emerald-700 focus:outline-none focus:border-gold-400"
              />
            </div>
          )}

          <div>
            <label htmlFor="auth-password-input" className="block text-emerald-400 font-bold mb-1">
              Password
            </label>
            <input
              id="auth-password-input"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={6}
              className="w-full bg-black/60 border border-emerald-800 rounded-xl px-3 py-2 text-white placeholder-emerald-700 focus:outline-none focus:border-gold-400"
            />
          </div>

          {tab === "register" && (
            <div>
              <span className="block text-emerald-400 font-bold mb-1">Avatar</span>
              <div className="grid grid-cols-6 gap-1.5">
                {AVATAR_OPTIONS.slice(0, 6).map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAvatarId(a.id)}
                    className={`h-9 rounded-lg flex items-center justify-center text-lg border transition-all ${
                      avatarId === a.id
                        ? "bg-gold-400/30 border-gold-400 scale-105"
                        : "bg-black/40 border-emerald-900 hover:border-emerald-700"
                    }`}
                  >
                    {a.emoji}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 rounded-xl bg-gold-400 hover:bg-gold-300 disabled:opacity-40 text-black font-extrabold text-xs tracking-wider shadow-lg transition-transform active:scale-95"
            >
              {isLoading
                ? "Processing..."
                : tab === "login"
                  ? "Sign In to FELT"
                  : "Create Account & Save Stats"}
            </button>
          </div>
        </form>

        <p className="text-[10px] text-emerald-600 text-center">
          Signing up persists your display name and career stats across sessions.
        </p>
      </div>
    </div>
  );
};
