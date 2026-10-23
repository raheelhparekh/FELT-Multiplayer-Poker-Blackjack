import React, { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ClientPokerGameView, SeatNumber } from "@felt/shared";
import { soundEngine } from "../audio/sound-engine";
import { HeaderBar } from "../components/HeaderBar";
import { PokerCommunityArea } from "../components/poker/PokerCommunityArea";
import { PokerSeatView } from "../components/poker/PokerSeatView";
import { PokerActionBar } from "../components/poker/PokerActionBar";
import { ChatDrawer } from "../components/modals/ChatDrawer";
import { HostPanelModal } from "../components/modals/HostPanelModal";
import { RebuyModal } from "../components/modals/RebuyModal";
import { SettingsModal } from "../components/modals/SettingsModal";
import { StandingsModal } from "../components/modals/StandingsModal";
import { useGameStore } from "../store/game-store";

// Visual slot positions (in percentage of table width/height) around a 9-max oval table.
interface SeatSlotPos {
  left: string;
  top: string;
  chipPos: "top" | "bottom" | "left" | "right";
}

// Perimeter corner positions (designed specifically for mobile screens like iPhone 15/16/17)
// Slot 0 is Bottom Center (Hero). Slots 1-8 are arranged around the outer rail and corners.
const SEAT_POSITIONS_9: Array<SeatSlotPos> = [
  { left: "50%", top: "79%", chipPos: "top" },    // 0: Bottom Center (Hero)
  { left: "14%", top: "68%", chipPos: "top" },    // 1: Bottom Left Corner
  { left: "7%",  top: "43%", chipPos: "right" },  // 2: Middle Left Edge
  { left: "13%", top: "15%", chipPos: "bottom" }, // 3: Top Left Corner
  { left: "36%", top: "9%",  chipPos: "bottom" }, // 4: Top Center-Left
  { left: "64%", top: "9%",  chipPos: "bottom" }, // 5: Top Center-Right
  { left: "87%", top: "15%", chipPos: "bottom" }, // 6: Top Right Corner
  { left: "93%", top: "43%", chipPos: "left" },   // 7: Middle Right Edge
  { left: "86%", top: "68%", chipPos: "top" },    // 8: Bottom Right Corner
];

const SEAT_POSITIONS_6: Array<SeatSlotPos> = [
  { left: "50%", top: "79%", chipPos: "top" },    // 0: Bottom Center (Hero)
  { left: "14%", top: "65%", chipPos: "top" },    // 1: Bottom Left
  { left: "16%", top: "15%", chipPos: "bottom" }, // 2: Top Left
  { left: "50%", top: "9%",  chipPos: "bottom" }, // 3: Top Center
  { left: "84%", top: "15%", chipPos: "bottom" }, // 4: Top Right
  { left: "86%", top: "65%", chipPos: "top" },    // 5: Bottom Right
];

export const PokerTableScreen: React.FC = () => {
  const currentView = useGameStore((s) => s.currentView) as ClientPokerGameView | null;
  const myPlayerId = useGameStore((s) => s.myPlayerId);
  const [rebuySent, setRebuySent] = useState(false);

  const {
    sit,
    openModal,
    pokerFold,
    pokerCheck,
    pokerCall,
    pokerBet,
    pokerRaise,
    pokerAllIn,
    pokerNextHand,
    resume,
    rebuyRequest,
  } = useGameStore.getState();

  if (!currentView || currentView.gameType !== "poker") return null;

  const myPlayer = currentView.players.find((p) => p.id === myPlayerId) ?? null;
  const mySeat = myPlayer?.seatNumber ?? null;
  const isSpectator = mySeat === null;
  const isHost = currentView.hostId === myPlayerId;
  const maxSeats = ((currentView.config as any).maxSeats ?? 9) as number;

  // Generate seats 1..maxSeats
  const allSeatNumbers: SeatNumber[] = useMemo(() => {
    return Array.from({ length: maxSeats }, (_, i) => (i + 1) as SeatNumber);
  }, [maxSeats]);

  // Rotate seat numbers so that hero's seat is at slot 0 (bottom-center)
  const orderedSeats: SeatNumber[] = useMemo(() => {
    if (mySeat === null) {
      return allSeatNumbers;
    }
    const heroIndex = allSeatNumbers.indexOf(mySeat);
    if (heroIndex === -1) return allSeatNumbers;
    return [
      ...allSeatNumbers.slice(heroIndex),
      ...allSeatNumbers.slice(0, heroIndex),
    ];
  }, [allSeatNumbers, mySeat]);

  // Compute hero turn & bet requirements
  const isMyTurn = myPlayer?.isTurn ?? false;
  const heroCommittedThisRound = myPlayer?.committedThisRound ?? 0;
  const toCall = Math.max(0, currentView.currentBet - heroCommittedThisRound);
  const minRaise = currentView.currentBet > 0
    ? currentView.currentBet * 2
    : currentView.config.bigBlind * 2;

  const totalPot = currentView.pots.reduce((sum, p) => sum + p.amount, 0);

  // Audio deal cues when hand starts or community street advances
  const prevHandRef = useRef(currentView.handNumber);
  const prevStreetRef = useRef(currentView.street);

  useEffect(() => {
    // New hand dealt: play sequential casino card deals around table
    if (currentView.handNumber > prevHandRef.current && currentView.players.length > 0) {
      prevHandRef.current = currentView.handNumber;
      const seatedCount = currentView.players.filter((p) => !p.hasFolded).length || 2;
      // 2 cards dealt to each player clockwise
      for (let r = 0; r < 2; r++) {
        for (let i = 0; i < seatedCount; i++) {
          const timeout = (r * seatedCount + i) * 130;
          setTimeout(() => {
            soundEngine.play("card_deal");
          }, timeout);
        }
      }
    } else {
      prevHandRef.current = currentView.handNumber;
    }
  }, [currentView.handNumber, currentView.players]);

  useEffect(() => {
    // Street advanced (Flop, Turn, River): play sequential card deal sounds
    if (currentView.street && currentView.street !== prevStreetRef.current) {
      prevStreetRef.current = currentView.street;
      if (currentView.street === "flop") {
        setTimeout(() => soundEngine.play("card_deal"), 80);
        setTimeout(() => soundEngine.play("card_deal"), 300);
        setTimeout(() => soundEngine.play("card_deal"), 520);
      } else if (currentView.street === "turn" || currentView.street === "river") {
        setTimeout(() => soundEngine.play("card_deal"), 100);
      }
    } else {
      prevStreetRef.current = currentView.street;
    }
  }, [currentView.street]);

  // Check if seated player has low stack (<1000 or < bigBlind)
  const canRebuy =
    !isSpectator &&
    myPlayer &&
    (myPlayer.stack < 1000 || myPlayer.stack < currentView.config.bigBlind);

  const isMidHandJoiner =
    !isSpectator &&
    myPlayer &&
    myPlayer.hasFolded &&
    myPlayer.cards.length === 0 &&
    currentView.phase !== "lobby";

  return (
    <div
      onClickCapture={() => soundEngine.unlock()}
      className="relative flex flex-col h-[100dvh] w-full bg-[var(--felt-bg)] text-[var(--felt-text)] overflow-hidden select-none transition-colors duration-500"
    >
      {/* Top Header */}
      <HeaderBar />

      {/* Main Felt Canvas - overflow-hidden prevents page bounce/scroll on iPhone */}
      <main className="flex-1 relative flex flex-col overflow-hidden p-1 sm:p-4 min-h-0">
        {/* Felt Table Surface Oval & Rail */}
        <div
          className="relative flex-1 w-full max-w-6xl mx-auto rounded-[2.2rem] sm:rounded-[4.5rem] border-[6px] sm:border-[10px] shadow-[inset_0_0_90px_rgba(0,0,0,0.9),0_12px_40px_rgba(0,0,0,0.8)] flex flex-col justify-between p-1 sm:p-6 transition-all duration-500 h-full min-h-0"
          style={{
            background:
              "radial-gradient(ellipse at center, var(--felt-surface-from) 0%, var(--felt-surface-via) 50%, var(--felt-surface-to) 100%)",
            borderColor: "var(--felt-rail)",
          }}
        >
          {/* Table Watermark & Rules Info */}
          <div className="absolute inset-x-0 top-[26%] flex flex-col items-center justify-center pointer-events-none opacity-25 text-center z-0">
            <span
              className="text-xs sm:text-sm font-black tracking-[0.3em] uppercase"
              style={{ color: "var(--felt-accent)" }}
            >
              TEXAS HOLD'EM NO LIMIT
            </span>
            <span
              className="text-[10px] sm:text-xs font-semibold tracking-widest uppercase mt-0.5"
              style={{ color: "var(--felt-text)" }}
            >
              Blinds ₹{currentView.config.smallBlind} / ₹{currentView.config.bigBlind}
            </span>
            <span
              className="text-[9px] font-mono tracking-wider uppercase mt-0.5 opacity-80"
              style={{ color: "var(--felt-text)" }}
            >
              Table #{currentView.roomCode} • Hand #{currentView.handNumber}
            </span>
          </div>

          {/* Table Paused / Reconnect Banner */}
          {currentView.isPaused && (
            <div className="relative z-30 mx-auto mb-2 flex items-center gap-2 bg-amber-950/90 border border-amber-500/80 px-4 py-2 rounded-2xl text-xs text-amber-100 shadow-xl backdrop-blur max-w-lg text-center animate-fade-in">
              <span className="text-base shrink-0">⏸</span>
              <div className="flex-1">
                <span className="font-bold block text-amber-300">Game Paused</span>
                <span className="text-[10px] text-amber-200/80 block">
                  Action timers are currently frozen.
                </span>
              </div>
              {isHost && (
                <button
                  type="button"
                  onClick={() => resume()}
                  className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow transition-transform active:scale-95 shrink-0"
                >
                  ▶ Resume
                </button>
              )}
            </div>
          )}

          {/* Mid-hand Joiner Banner */}
          {isMidHandJoiner && (
            <div className="relative z-30 mx-auto mb-1 flex items-center gap-1.5 bg-blue-950/85 border border-blue-500/70 px-3.5 py-1 rounded-full text-xs text-blue-200 shadow-md">
              <span className="text-sm">⏳</span>
              <span>Joined mid-round: you are seated and will be dealt into the next hand!</span>
            </div>
          )}

          {/* Low Stack / Rebuy Banner (<1000 or <bigBlind) */}
          {canRebuy && (
            <div className="relative z-30 mx-auto mb-2 flex items-center gap-2 bg-amber-950/90 border border-amber-500/80 px-3.5 py-1.5 rounded-xl text-xs text-amber-200 shadow-xl backdrop-blur-md">
              <span className="font-semibold">
                {rebuySent
                  ? "✓ Request for 10,000 chips sent to host!"
                  : myPlayer.stack <= 0
                    ? "Out of chips!"
                    : `Chips low (₹${myPlayer.stack.toLocaleString()})`}
              </span>
              {!rebuySent && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      rebuyRequest(10000);
                      setRebuySent(true);
                      setTimeout(() => setRebuySent(false), 4000);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-gold-400 hover:bg-gold-300 active:scale-95 text-black font-extrabold text-[11px] shadow transition-all flex items-center gap-1"
                  >
                    <span>Request +10k Chips</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openModal("rebuy")}
                    className="text-[11px] text-gold-300/80 hover:text-gold-200 underline px-1"
                  >
                    Custom
                  </button>
                </>
              )}
            </div>
          )}

          {/* Center Community Area */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="pointer-events-auto">
              <PokerCommunityArea
                communityCards={currentView.communityCards}
                pots={currentView.pots}
                street={currentView.street}
                phase={currentView.phase}
                tableStatusMessage={currentView.tableStatusMessage}
              />

              {/* Showdown / Hand Winners Celebration Overlay */}
              <AnimatePresence>
                {currentView.winners && currentView.winners.length > 0 && (
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0, y: 15 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    className="mt-3 bg-black/85 backdrop-blur-md border-2 border-gold-400 px-4 py-2.5 rounded-2xl shadow-[0_0_25px_rgba(212,175,55,0.5)] flex flex-col items-center gap-1.5 text-center select-none"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-xl">🏆</span>
                      <span className="text-xs sm:text-sm font-black text-gold-300">
                        {currentView.winners
                          .map((w) => {
                            const p = currentView.players.find((pl) => pl.id === w.playerId);
                            return `${p?.displayName ?? w.playerId} won ₹${w.amount.toLocaleString()} with ${w.handName}`;
                          })
                          .join(" • ")}
                      </span>
                    </div>

                    {/* Host Manual Next Hand Button */}
                    {isHost && (
                      <button
                        type="button"
                        onClick={() => pokerNextHand()}
                        className="mt-1 px-4 py-1 rounded-xl bg-gold-400 hover:bg-gold-300 active:scale-95 text-black font-black text-xs shadow-md transition-all flex items-center gap-1.5"
                      >
                        <span>Next Hand</span>
                        <span>➔</span>
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Seats Arranged Around the Perimeter Corners & Rail */}
          <div className="absolute inset-0 pointer-events-none z-20">
            {orderedSeats.map((seatNum, slotIdx) => {
              const seatLayout = maxSeats <= 6 ? SEAT_POSITIONS_6 : SEAT_POSITIONS_9;
              const pos = seatLayout[slotIdx % seatLayout.length] ?? { left: "50%", top: "50%", chipPos: "top" };
              const player = currentView.players.find((p) => p.seatNumber === seatNum) ?? null;
              const isMe = player?.id === myPlayerId;
              const isDealerButton = currentView.dealerButtonSeat === seatNum;
              const isSmallBlind = currentView.smallBlindSeat === seatNum;
              const isBigBlind = currentView.bigBlindSeat === seatNum;

              return (
                <div
                  key={`poker-seat-slot-${seatNum}`}
                  className="absolute pointer-events-auto transform -translate-x-1/2 -translate-y-1/2 transition-all duration-300"
                  style={{ left: pos.left, top: pos.top }}
                >
                  <PokerSeatView
                    seatNumber={seatNum}
                    player={player}
                    isMe={isMe}
                    isDealerButton={isDealerButton}
                    isSmallBlind={isSmallBlind}
                    isBigBlind={isBigBlind}
                    canSit={isSpectator && !player}
                    actionDeadline={player?.isTurn ? currentView.actionDeadline : null}
                    onSit={() => sit(seatNum)}
                    dealOrder={slotIdx}
                    totalSeated={orderedSeats.length}
                    handNumber={currentView.handNumber}
                    chipPosition={pos.chipPos}
                    className={isMe ? "scale-100 sm:scale-110" : "scale-85 sm:scale-95"}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* Pinned Bottom Thumb Reach Action Bar (for seated hero) */}
      {!isSpectator && myPlayer && (
        <div className="relative z-30 p-1 sm:p-3 pb-2 sm:pb-4 shrink-0">
          <PokerActionBar
            isMyTurn={isMyTurn}
            legalActions={currentView.myLegalActions}
            toCall={toCall}
            currentBet={currentView.currentBet}
            minRaise={minRaise}
            heroStack={myPlayer.stack}
            heroCommittedThisRound={heroCommittedThisRound}
            potSize={totalPot}
            bigBlind={currentView.config.bigBlind}
            onFold={pokerFold}
            onCheck={pokerCheck}
            onCall={pokerCall}
            onBet={pokerBet}
            onRaise={pokerRaise}
            onAllIn={pokerAllIn}
          />
        </div>
      )}

      {/* Spectator Prompt if not seated */}
      {isSpectator && (
        <div className="relative z-30 p-2 text-center">
          <span className="text-xs text-emerald-400/80 bg-black/60 px-4 py-1.5 rounded-full border border-emerald-800/60 shadow">
            You are spectating. Click any empty seat to join the game!
          </span>
        </div>
      )}

      {/* Slide-overs & Modals */}
      <ChatDrawer />
      <HostPanelModal />
      <StandingsModal />
      <RebuyModal />
      <SettingsModal />
    </div>
  );
};
