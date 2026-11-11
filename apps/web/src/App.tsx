import type React from "react";
import { useEffect, useRef, useState } from "react";
import { BrowserRouter, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { NotificationToast } from "./components/NotificationToast";
import { LandingScreen } from "./screens/LandingScreen";
import { LobbyScreen } from "./screens/LobbyScreen";
import { TableScreen } from "./screens/TableScreen";
import { PokerTableScreen } from "./screens/PokerTableScreen";
import { useGameStore } from "./store/game-store";
import { useSettingsStore } from "./store/settings-store";

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
  const wasInRoomRef = useRef(false);

  const cleanCode = (roomCode || "").toUpperCase();
  const hasTokenForRoom = Boolean(token && storeRoomCode === cleanCode);
  const hasSavedProfile = Boolean(
    typeof window !== "undefined" && localStorage.getItem("felt_display_name"),
  );

  // Remember once the client has entered this room so leaving or closing navigates cleanly to "/"
  useEffect(() => {
    if (currentView && currentView.roomCode === cleanCode) {
      wasInRoomRef.current = true;
    }
  }, [currentView, cleanCode]);

  // Reset tracking when navigating to a different room code
  useEffect(() => {
    wasInRoomRef.current = Boolean(currentView && currentView.roomCode === cleanCode);
    setAttemptedJoin(false);
  }, [cleanCode]); // eslint-disable-line react-hooks/exhaustive-deps

  // If left room or table closed, navigate back to landing without auto-rejoining
  useEffect(() => {
    if (!storeRoomCode && (wasInRoomRef.current || attemptedJoin)) {
      navigate("/");
    }
  }, [storeRoomCode, attemptedJoin, navigate]);

  useEffect(() => {
    if (!roomCode) {
      navigate("/");
      return;
    }

    if (wasInRoomRef.current && !storeRoomCode) {
      return;
    }

    // Only auto-join if we have an existing session token for this room OR an existing profile
    if (
      (!currentView || storeRoomCode !== cleanCode) &&
      !attemptedJoin &&
      (hasTokenForRoom || hasSavedProfile)
    ) {
      setAttemptedJoin(true);
      joinRoom(cleanCode).catch(() => {
        // Handled via store errorMessage
      });
    }
  }, [
    roomCode,
    currentView,
    storeRoomCode,
    attemptedJoin,
    joinRoom,
    navigate,
    cleanCode,
    hasTokenForRoom,
    hasSavedProfile,
  ]);

  // Synchronize room table theme across all players in room
  useEffect(() => {
    if (currentView?.config?.tableTheme) {
      document.documentElement.setAttribute("data-theme", currentView.config.tableTheme);
      useSettingsStore.setState({ theme: currentView.config.tableTheme });
    }
  }, [currentView?.config?.tableTheme]);

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
  if (currentView.gameType === "poker") {
    return <PokerTableScreen />;
  }

  return <TableScreen />;
};

export default function App() {
  const init = useGameStore((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <BrowserRouter>
      <NotificationToast />
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<LandingScreen />} />
          <Route path="/r/:roomCode" element={<RoomRoute />} />
          <Route path="*" element={<LandingScreen />} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
