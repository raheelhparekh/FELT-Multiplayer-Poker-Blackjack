import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useGameStore } from "../../store/game-store";

export const ChatDrawer: React.FC = () => {
  const activeModal = useGameStore((s) => s.activeModal);
  const closeModal = useGameStore((s) => s.closeModal);
  const chatLog = useGameStore((s) => s.chatLog);
  const activityLog = useGameStore((s) => s.activityLog);
  const myPlayerId = useGameStore((s) => s.myPlayerId);
  const sendChat = useGameStore((s) => s.sendChat);

  const [activeTab, setActiveTab] = useState<"chat" | "activity">(
    activeModal === "activity" ? "activity" : "chat",
  );
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeModal === "activity") {
      setActiveTab("activity");
    } else if (activeModal === "chat") {
      setActiveTab("chat");
    }
  }, [activeModal]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatLog, activityLog, activeTab]);

  if (activeModal !== "chat" && activeModal !== "activity") {
    return null;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed) return;
    sendChat(trimmed);
    setInputText("");
  };

  const formatTime = (ts?: number | null) => {
    if (!ts) return "";
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return "";
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fade-in">
      {/* Click outside to close */}
      <button
        type="button"
        aria-label="Close background"
        onClick={closeModal}
        className="flex-1 cursor-default"
      />

      <div className="w-full max-w-md h-full bg-[#0a1a0f] border-l border-emerald-900/50 flex flex-col shadow-2xl">
        {/* Header & Tabs */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-emerald-900/40 bg-black/40">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("chat")}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold tracking-wide transition-all ${
                activeTab === "chat"
                  ? "bg-emerald-800/80 text-emerald-100 shadow"
                  : "text-emerald-400/60 hover:text-emerald-200"
              }`}
            >
              Live Chat
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("activity")}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold tracking-wide transition-all ${
                activeTab === "activity"
                  ? "bg-emerald-800/80 text-emerald-100 shadow"
                  : "text-emerald-400/60 hover:text-emerald-200"
              }`}
            >
              Activity Log
            </button>
          </div>

          <button
            type="button"
            onClick={closeModal}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-emerald-400 hover:text-emerald-100 hover:bg-emerald-900/40 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 font-sans text-sm">
          {activeTab === "chat" ? (
            chatLog.length === 0 ? (
              <div className="h-full flex items-center justify-center text-emerald-500/40 text-xs italic">
                No chat messages yet. Say hello!
              </div>
            ) : (
              chatLog.map((msg) => {
                const isMe = msg.senderId === myPlayerId;
                return (
                  <div
                    key={`chat-${msg.seq}-${msg.ts}`}
                    className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
                  >
                    <div className="flex items-baseline gap-1.5 text-[11px] text-emerald-400/60 mb-0.5 px-1">
                      <span className="font-semibold text-emerald-300">
                        {isMe ? "You" : msg.senderName}
                      </span>
                      <span>{formatTime(msg.ts)}</span>
                    </div>
                    <div
                      className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed break-words shadow ${
                        isMe
                          ? "bg-emerald-700 text-white rounded-tr-none"
                          : "bg-emerald-950/80 text-emerald-100 border border-emerald-800/40 rounded-tl-none"
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                );
              })
            )
          ) : activityLog.length === 0 ? (
            <div className="h-full flex items-center justify-center text-emerald-500/40 text-xs italic">
              No activity recorded yet this round.
            </div>
          ) : (
            activityLog.filter(Boolean).map((act, idx) => (
              <div
                key={`act-${act.seq ?? idx}-${act.ts ?? idx}`}
                className="flex items-start gap-2 text-xs text-emerald-300/80 py-1 border-b border-emerald-900/20 font-mono"
              >
                <span className="text-[10px] text-emerald-600 mt-0.5 shrink-0">
                  {formatTime(act.ts)}
                </span>
                <span className="flex-1 break-words">{act.text ?? ""}</span>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar (only visible in chat tab) */}
        {activeTab === "chat" && (
          <form
            onSubmit={handleSubmit}
            className="p-3 border-t border-emerald-900/40 bg-black/40 flex items-center gap-2"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Send a message to table..."
              maxLength={200}
              className="flex-1 bg-emerald-950/60 border border-emerald-800/60 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-emerald-600 focus:outline-none focus:border-gold-400 transition-colors"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="h-9 px-4 rounded-xl bg-gold-400 hover:bg-gold-300 disabled:opacity-40 disabled:hover:bg-gold-400 text-black font-bold text-xs shadow-md transition-all active:scale-95"
            >
              Send
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
