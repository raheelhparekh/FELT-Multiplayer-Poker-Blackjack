import type React from "react";
import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { LandingScreen } from "./screens/LandingScreen";
import { LobbyScreen } from "./screens/LobbyScreen";
import { TableScreen } from "./screens/TableScreen";
import { useGameStore } from "./store/game-store";

const RoomRoute: React.FC = () => {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const currentView = useGameStore((s) => s.currentView);
  const storeRoomCode = useGameStore((s) => s.roomCode);
  const token = useGameStore((s) => s.token);
  const connectionStatus = useGameStore((s) => s.connectionStatus);
  const joinRoom = useGameStore((s) => s.joinRoom);
  const errorMessage = useGameStore((s) => s.errorMessage);

  const [attemptedJoin, setAttemptedJoin] = useState(false);

  const cleanCode = (roomCode || "").toUpperCase();
  const hasTokenForRoom = Boolean(token && storeRoomCode === cleanCode);
  const hasSavedProfile = Boolean(
    typeof window !== "undefined" && localStorage.getItem("felt_display_name"),
  );

  useEffect(() => {
    if (!roomCode) {
      navigate("/");
      return;
    }

    // Only auto-join if we have an existing session token for this room OR an existing profile
    if ((!currentView || storeRoomCode !== cleanCode) && !attemptedJoin && (hasTokenForRoom || hasSavedProfile)) {
      setAttemptedJoin(true);
      joinRoom(cleanCode).catch(() => {
        // Handled via store errorMessage
      });
    }
  }, [roomCode, currentView, storeRoomCode, attemptedJoin, joinRoom, navigate, cleanCode, hasTokenForRoom, hasSavedProfile]);

  // If left room, navigate back to landing
  useEffect(() => {
    if (!storeRoomCode && attemptedJoin) {
      navigate("/");
    }
  }, [storeRoomCode, attemptedJoin, navigate]);

  // If opening an invite link for the first time without a profile, prompt for name & avatar
  if (!currentView && !hasTokenForRoom && !hasSavedProfile) {
    return <LandingScreen initialCode={roomCode} />;
  }

  if (!currentView) {
    if (errorMessage) {
      return <LandingScreen initialCode={roomCode} />;
    }

    return (
      <div className="min-h-screen bg-[#07130a] flex flex-col items-center justify-center text-emerald-100 p-4">
        <div className="w-12 h-12 border-4 border-gold-400 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-semibold tracking-wider text-gold-300">
          Connecting to Table {roomCode?.toUpperCase()}...
        </p>
        <span className="text-xs text-emerald-500/70 mt-1">Status: {connectionStatus}</span>
      </div>
    );
  }

  // If session has not started or phase is lobby, show LobbyScreen
  if (currentView.phase === "lobby" || !currentView.isSessionStarted) {
    return <LobbyScreen />;
  }

  // Active game session
  return <TableScreen />;
};

export default function App() {
  const init = useGameStore((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingScreen />} />
        <Route path="/r/:roomCode" element={<RoomRoute />} />
        <Route path="*" element={<LandingScreen />} />
      </Routes>
    </BrowserRouter>
  );
}
