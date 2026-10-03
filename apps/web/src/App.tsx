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
  const connectionStatus = useGameStore((s) => s.connectionStatus);
  const joinRoom = useGameStore((s) => s.joinRoom);
  const errorMessage = useGameStore((s) => s.errorMessage);

  const [attemptedJoin, setAttemptedJoin] = useState(false);

  useEffect(() => {
    if (!roomCode) {
      navigate("/");
      return;
    }

    const cleanCode = roomCode.toUpperCase();
    // If not in this room and not already joined
    if ((!currentView || storeRoomCode !== cleanCode) && !attemptedJoin) {
      setAttemptedJoin(true);
      joinRoom(cleanCode).catch(() => {
        // Handled via store errorMessage
      });
    }
  }, [roomCode, currentView, storeRoomCode, attemptedJoin, joinRoom, navigate]);

  // If left room, navigate back to landing
  useEffect(() => {
    if (!storeRoomCode && attemptedJoin) {
      navigate("/");
    }
  }, [storeRoomCode, attemptedJoin, navigate]);

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
