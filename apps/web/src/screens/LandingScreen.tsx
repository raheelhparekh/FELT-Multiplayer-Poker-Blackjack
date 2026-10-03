import type React from "react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthModal } from "../components/modals/AuthModal";
import { HistoryModal } from "../components/modals/HistoryModal";
import { useAuthStore } from "../store/auth-store";
import { useGameStore } from "../store/game-store";
import { AVATAR_OPTIONS } from "../types/avatars";

interface LandingScreenProps {
  initialCode?: string | undefined;
}

export const LandingScreen: React.FC<LandingScreenProps> = ({ initialCode = "" }) => {
  const navigate = useNavigate();
  const displayName = useGameStore((s) => s.displayName);
  const avatarId = useGameStore((s) => s.avatarId);
  const errorMessage = useGameStore((s) => s.errorMessage);
  const clearError = useGameStore((s) => s.clearError);
  const setProfile = useGameStore((s) => s.setProfile);
  const createRoom = useGameStore((s) => s.createRoom);
  const joinRoom = useGameStore((s) => s.joinRoom);

  const user = useAuthStore((s) => s.user);
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const logout = useAuthStore((s) => s.logout);

  const [name, setName] = useState(displayName || "");
  const [selectedAvatar, setSelectedAvatar] = useState(avatarId || "lion");
  const [joinCode, setJoinCode] = useState(initialCode.toUpperCase());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (user) {
      setName(user.username);
      setSelectedAvatar(user.avatarId);
      setProfile(user.username, user.avatarId);
    }
  }, [user, setProfile]);

  const handleProfileChange = (newName: string, newAvatar: string) => {
    setName(newName);
    setSelectedAvatar(newAvatar);
    setProfile(newName, newAvatar);
  };

  const handleCreate = async () => {
    const finalName = name.trim() || "Player";
    handleProfileChange(finalName, selectedAvatar);
    clearError();
    setIsSubmitting(true);
    try {
      const code = await createRoom();
      navigate(`/r/${code}`);
    } catch {
      // Error handled by store
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalCode = joinCode.trim().toUpperCase();
    if (!finalCode) return;
    const finalName = name.trim() || "Player";
    handleProfileChange(finalName, selectedAvatar);
    clearError();
    setIsSubmitting(true);
    try {
      await joinRoom(finalCode);
      navigate(`/r/${finalCode}`);
    } catch {
      // Error handled by store
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#07130a] text-emerald-100 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background felt texture & subtle gradient rings */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[#11381d] via-[#091f11] to-[#040c06] -z-10" />

      {/* Top Bar for Auth State */}
      <div className="absolute top-4 right-4 z-20">
        {user ? (
          <div className="flex items-center gap-2 bg-black/60 border border-gold-400/40 rounded-2xl px-3 py-1.5 shadow">
            <span className="text-sm">
              {AVATAR_OPTIONS.find((a) => a.id === user.avatarId)?.emoji ?? "👤"}
            </span>
            <span className="font-bold text-xs text-white">{user.username}</span>
            <button
              type="button"
              onClick={() => setShowHistoryModal(true)}
              className="text-[10px] text-gold-300 hover:underline font-semibold ml-1"
            >
              Stats
            </button>
            <button
              type="button"
              onClick={() => logout()}
              className="text-[10px] text-zinc-400 hover:text-rose-300 ml-1"
            >
              Sign out
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowAuthModal(true)}
            className="px-3 py-1.5 rounded-xl bg-gold-400/20 hover:bg-gold-400 hover:text-black border border-gold-400/60 text-xs font-bold text-gold-300 transition-all shadow"
          >
            Sign In / Register
          </button>
        )}
      </div>

      <div className="w-full max-w-md bg-[#0a1a0f]/90 border border-emerald-800/60 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-1">
          <div className="inline-flex items-center justify-center gap-2 mb-1">
            <span className="text-3xl text-gold-400">♠</span>
            <h1 className="text-3xl sm:text-4xl font-black tracking-widest text-white">FELT</h1>
            <span className="text-3xl text-gold-400">♣</span>
          </div>
          <p className="text-xs sm:text-sm text-emerald-400 font-medium">
            Real-time multiplayer blackjack for friends
          </p>
        </div>

        {/* Global Error Banner if any */}
        {errorMessage && (
          <div className="bg-rose-950/80 border border-rose-700/60 rounded-xl p-3 text-xs text-rose-200 flex items-center justify-between animate-fade-in">
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={clearError}
              className="text-rose-400 hover:text-white font-bold ml-2 text-sm"
            >
              ✕
            </button>
          </div>
        )}

        {/* Profile Card: Name & Avatar */}
        <div className="space-y-3 bg-emerald-950/40 border border-emerald-900/60 rounded-2xl p-4">
          <label
            htmlFor="display-name-input"
            className="block text-xs font-bold uppercase tracking-wider text-emerald-300"
          >
            Player Name
          </label>
          <input
            id="display-name-input"
            type="text"
            value={name}
            onChange={(e) => handleProfileChange(e.target.value, selectedAvatar)}
            placeholder="Enter your name..."
            maxLength={20}
            className="w-full bg-black/50 border border-emerald-700/60 focus:border-gold-400 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-white placeholder-emerald-600 focus:outline-none transition-colors"
          />

          <span className="block text-xs font-bold uppercase tracking-wider text-emerald-300 pt-1">
            Choose Avatar
          </span>
          <div className="grid grid-cols-6 gap-2">
            {AVATAR_OPTIONS.map((avatar) => {
              const isSelected = selectedAvatar === avatar.id;
              return (
                <button
                  type="button"
                  key={avatar.id}
                  onClick={() => handleProfileChange(name, avatar.id)}
                  className={`h-11 rounded-xl flex items-center justify-center text-xl transition-all ${
                    isSelected
                      ? "bg-gold-400/20 border-2 border-gold-400 scale-105 shadow-md"
                      : "bg-emerald-950/80 border border-emerald-800/40 hover:bg-emerald-900/40"
                  }`}
                  title={avatar.name}
                >
                  {avatar.emoji}
                </button>
              );
            })}
          </div>
        </div>

        {/* Action Buttons: Host vs Join */}
        <div className="space-y-4 pt-2">
          {/* Create Table */}
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleCreate}
            className="w-full min-h-[48px] py-3 rounded-2xl bg-gold-400 hover:bg-gold-300 active:scale-[0.98] text-black font-extrabold text-sm tracking-wide shadow-lg transition-all flex items-center justify-center gap-2"
          >
            <span>Create New Table</span>
            <span className="text-base">→</span>
          </button>

          {/* Divider */}
          <div className="relative flex items-center justify-center">
            <div className="border-t border-emerald-900/60 w-full" />
            <span className="bg-[#0a1a0f] px-3 text-[11px] font-bold text-emerald-500 uppercase tracking-wider">
              or join existing
            </span>
          </div>

          {/* Join with Code */}
          <form onSubmit={handleJoin} className="flex gap-2">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ROOM CODE"
              maxLength={6}
              className="flex-1 min-h-[44px] bg-black/50 border border-emerald-700/60 focus:border-gold-400 rounded-xl px-3 py-2 text-center text-sm font-mono font-bold tracking-widest text-gold-300 placeholder-emerald-700 uppercase focus:outline-none transition-colors"
            />
            <button
              type="submit"
              disabled={isSubmitting || !joinCode.trim()}
              className="min-h-[44px] px-5 rounded-xl bg-emerald-700 hover:bg-emerald-600 active:scale-95 disabled:opacity-40 text-white font-bold text-sm tracking-wide shadow transition-all"
            >
              Join
            </button>
          </form>
        </div>
      </div>

      <footer className="mt-6 text-center text-xs text-emerald-600/80">
        P2P Private Room • No Real Money • Tap & Play
      </footer>

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
      <HistoryModal isOpen={showHistoryModal} onClose={() => setShowHistoryModal(false)} />
    </div>
  );
};
