import type React from "react";
import { soundEngine } from "../../audio/sound-engine";
import { useGameStore } from "../../store/game-store";
import { CASINO_THEMES, useSettingsStore } from "../../store/settings-store";

export const SettingsModal: React.FC = () => {
  const activeModal = useGameStore((s) => s.activeModal);
  const closeModal = useGameStore((s) => s.closeModal);

  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const fourColorDeck = useSettingsStore((s) => s.fourColorDeck);
  const setFourColorDeck = useSettingsStore((s) => s.setFourColorDeck);
  const animationSpeed = useSettingsStore((s) => s.animationSpeed);
  const setAnimationSpeed = useSettingsStore((s) => s.setAnimationSpeed);
  const sound = useSettingsStore((s) => s.sound);
  const updateSound = useSettingsStore((s) => s.updateSound);

  const currentView = useGameStore((s) => s.currentView);
  const myPlayerId = useGameStore((s) => s.myPlayerId);
  const updateConfig = useGameStore((s) => s.updateConfig);
  const isHost = currentView ? currentView.hostId === myPlayerId : true;

  if (activeModal !== "settings") {
    return null;
  }

  const handleTestSound = () => {
    soundEngine.play("chip_place");
    setTimeout(() => soundEngine.play("card_flip"), 120);
    setTimeout(() => soundEngine.play("win_small"), 300);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-[#0c1810] border border-gold-400/40 rounded-3xl flex flex-col shadow-2xl overflow-hidden max-h-[90dvh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-emerald-900/50 bg-black/40">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚙️</span>
            <h2 className="text-base font-bold text-white tracking-wide">Table & Audio Settings</h2>
          </div>
          <button
            type="button"
            onClick={closeModal}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-emerald-400 hover:text-white hover:bg-emerald-900/50 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs text-emerald-200">
          {/* Theme Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold uppercase tracking-wider text-emerald-300 text-[11px] block">
                Casino Table Felt Color{" "}
                {currentView && (isHost ? "(Sets for room)" : "(Host controlled)")}
              </span>
              <span className="text-[10px] text-gold-300 font-mono">
                {CASINO_THEMES.find((t) => t.id === theme)?.feltLabel ?? "Casino Felt"}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {CASINO_THEMES.map((item) => {
                const isSelected = theme === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (currentView && !isHost) {
                        useGameStore.setState({
                          errorMessage:
                            "Only the table host can change the felt color for the room.",
                        });
                        return;
                      }
                      setTheme(item.id);
                      if (currentView && isHost) {
                        updateConfig({ tableTheme: item.id });
                      }
                    }}
                    className={`p-2.5 rounded-2xl border text-left flex items-center gap-3 transition-all ${
                      isSelected
                        ? "bg-emerald-950/80 border-gold-400 shadow-lg ring-1 ring-gold-400"
                        : "bg-black/40 border-emerald-900/40 hover:bg-black/60 hover:border-emerald-700/60"
                    }`}
                  >
                    <div
                      className="w-7 h-7 rounded-full border-2 border-white/80 shadow-inner shrink-0"
                      style={{
                        background: `radial-gradient(circle at 35% 35%, ${item.fromColor}, ${item.viaColor})`,
                        borderColor: isSelected ? "#f0d060" : "rgba(255,255,255,0.4)",
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white text-xs truncate">{item.name}</span>
                        {isSelected && (
                          <span className="text-[10px] text-gold-300 font-black">✓</span>
                        )}
                      </div>
                      <div className="text-[10px] text-emerald-400/80 truncate">
                        {item.feltLabel}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4-Color Deck Toggle */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-emerald-950/40 border border-emerald-900/60">
            <div>
              <div className="font-bold text-white text-xs">4-Colour Deck</div>
              <div className="text-[10px] text-emerald-400/70">
                Red ♥, Blue ♦, Green ♣, Black ♠ (Colorblind friendly)
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFourColorDeck(!fourColorDeck)}
              className={`w-12 h-6 rounded-full transition-colors relative ${
                fourColorDeck ? "bg-gold-400" : "bg-zinc-700"
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-black absolute top-1 transition-transform ${
                  fourColorDeck ? "left-7" : "left-1"
                }`}
              />
            </button>
          </div>

          {/* Animation Speed / Reduced Motion */}
          <div className="space-y-2">
            <span className="font-bold uppercase tracking-wider text-emerald-300 text-[11px] block">
              Animation Speed
            </span>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Normal (1×)", value: 1 },
                { label: "Fast (1.5×)", value: 1.5 },
                { label: "Turbo (2×)", value: 2 },
                { label: "Off / Reduced", value: 0 },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAnimationSpeed(opt.value)}
                  className={`py-2 px-1 rounded-xl text-center font-bold text-[10px] border transition-all ${
                    animationSpeed === opt.value
                      ? "bg-gold-400 text-black border-gold-300 shadow"
                      : "bg-black/30 border-emerald-900/60 text-emerald-300 hover:bg-black/50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sound & Audio Controls */}
          <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-900/60 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold uppercase tracking-wider text-emerald-300 text-[11px]">
                Audio & Volume
              </span>
              <button
                type="button"
                onClick={handleTestSound}
                className="px-2.5 py-1 rounded-lg bg-emerald-800/80 hover:bg-emerald-700 active:scale-95 text-[10px] font-bold text-emerald-100 border border-emerald-600/40 transition-all"
              >
                Test Sound 🔊
              </button>
            </div>

            {/* Mute Toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sound.muted}
                onChange={(e) => updateSound({ muted: e.target.checked })}
                className="w-4 h-4 rounded accent-gold-400"
              />
              <span className="text-xs font-semibold text-white">Mute all audio</span>
            </label>

            {/* Master Volume */}
            <div>
              <div className="flex justify-between text-[10px] text-emerald-400 mb-1">
                <span>Master Volume</span>
                <span className="font-mono">{Math.round(sound.masterVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={sound.masterVolume}
                disabled={sound.muted}
                onChange={(e) => updateSound({ masterVolume: Number.parseFloat(e.target.value) })}
                className="w-full accent-gold-400"
              />
            </div>

            {/* SFX Volume */}
            <div>
              <div className="flex justify-between text-[10px] text-emerald-400 mb-1">
                <span>Sound Effects (Cards, Chips, Wins)</span>
                <span className="font-mono">{Math.round(sound.sfxVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={sound.sfxVolume}
                disabled={sound.muted}
                onChange={(e) => updateSound({ sfxVolume: Number.parseFloat(e.target.value) })}
                className="w-full accent-gold-400"
              />
            </div>

            {/* Haptics Toggle */}
            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={sound.hapticsEnabled}
                onChange={(e) => updateSound({ hapticsEnabled: e.target.checked })}
                className="w-4 h-4 rounded accent-gold-400"
              />
              <span className="text-xs font-semibold text-white">
                Haptic vibration on turn & blackjack (supported devices)
              </span>
            </label>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-emerald-900/50 bg-black/40 flex justify-end">
          <button
            type="button"
            onClick={closeModal}
            className="px-5 py-2 rounded-xl bg-gold-400 hover:bg-gold-300 text-black font-bold text-xs tracking-wider shadow transition-transform active:scale-95"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
