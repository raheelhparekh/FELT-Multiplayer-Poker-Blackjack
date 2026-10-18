import type {
  ActivityEntry,
  ChatMessage,
  ClientGameView,
  ClientPokerGameView,
  RoomConfig,
  ServerError,
  TableNotification,
} from "@felt/shared";
import { type Socket, io } from "socket.io-client";
import { create } from "zustand";
import { soundEngine } from "../audio/sound-engine";

export type ModalType = "chat" | "activity" | "host" | "standings" | "rebuy" | "settings" | null;

export interface GameStoreState {
  socket: Socket | null;
  connectionStatus: "disconnected" | "connecting" | "connected";
  currentView: ClientGameView | null;
  roomCode: string | null;
  myPlayerId: string | null;
  token: string | null;
  displayName: string;
  avatarId: string;
  chatLog: ChatMessage[];
  activityLog: ActivityEntry[];
  unreadChatCount: number;
  errorMessage: string | null;
  activeModal: ModalType;
  selectedChip: number;
  tableNotification: TableNotification | null;

  // Actions
  init: () => void;
  setProfile: (name: string, avatarId: string) => void;
  openModal: (modal: ModalType) => void;
  closeModal: () => void;
  clearError: () => void;
  dismissNotification: () => void;
  setSelectedChip: (amount: number) => void;

  createRoom: (password?: string, config?: any, buyIn?: number, gameType?: import("@felt/shared").GameType) => Promise<string>;
  joinRoom: (code: string, password?: string, buyIn?: number) => Promise<void>;
  leaveRoom: () => void;

  // In-room actions
  sit: (seat: number) => void;
  stand: () => void;
  startSession: () => void;
  setDealer: (targetId: string) => void;
  assignSeat: (targetId: string, seat: number | null) => void;
  kick: (targetId: string) => void;
  transferHost: (targetId: string) => void;
  adjustChips: (target: string, op: "set" | "add" | "subtract", amount: number) => void;
  updateConfig: (config: any) => void;
  pause: () => void;
  resume: () => void;
  endSession: () => void;
  forceStand: () => void;
  cancelRound: () => void;
  recoverDealer: (newDealerId: string) => void;
  closeTable: () => void;

  // Betting actions
  betAdd: (amount: number) => void;
  betUndo: () => void;
  betClear: () => void;
  betRepeat: () => void;
  betLock: () => void;
  betSitOut: () => void;

  // Dealer actions
  dealerDeal: () => void;
  dealerReveal: () => void;
  dealerDraw: () => void;
  dealerNextRound: () => void;
  dealerShuffle: () => void;

  // Player hand actions
  playHit: (handId: string) => void;
  playStand: (handId: string) => void;
  playDouble: (handId: string) => void;
  playSplit: (handId: string) => void;
  playInsurance: (handId: string, accept: boolean) => void;

  // Poker actions
  pokerFold: () => void;
  pokerCheck: () => void;
  pokerCall: () => void;
  pokerBet: (amount: number) => void;
  pokerRaise: (to: number) => void;
  pokerAllIn: () => void;
  pokerShowCards: () => void;
  pokerSeeCards: () => void;
  pokerDealNextStreet: () => void;
  pokerNextHand: () => void;
  pokerSitOut: () => void;
  pokerSitIn: () => void;

  // Rebuy
  rebuyRequest: (amount?: number) => void;
  hostApproveRebuy: (targetId: string, amount?: number) => void;

  // Chat
  sendChat: (text: string) => void;
}

const STORAGE_KEYS = {
  NAME: "felt_display_name",
  AVATAR: "felt_avatar_id",
  TOKEN: "felt_guest_token",
  ROOM: "felt_room_code",
};

const getInitialStoredState = () => {
  if (typeof window === "undefined") {
    return {
      displayName: "Player",
      avatarId: "lion",
      token: null,
      roomCode: null,
    };
  }
  return {
    displayName: localStorage.getItem(STORAGE_KEYS.NAME) || "Player",
    avatarId: localStorage.getItem(STORAGE_KEYS.AVATAR) || "lion",
    token: localStorage.getItem(STORAGE_KEYS.TOKEN),
    roomCode: localStorage.getItem(STORAGE_KEYS.ROOM),
  };
};

export const useGameStore = create<GameStoreState>((set, get) => {
  let socketInstance: Socket | null = null;

  const ensureSocket = (): Socket => {
    if (socketInstance) return socketInstance;

    const socket = io({
      transports: ["websocket", "polling"],
      autoConnect: true,
    });

    socket.on("connect", () => {
      set({ connectionStatus: "connected" });
      // Only auto-reconnect if already in an active room session and connection was dropped
      const { token, roomCode, displayName, avatarId, currentView } = get();
      if (currentView && token && roomCode) {
        socket.emit(
          "room:join",
          { code: roomCode, displayName, avatarId, token },
          (res: { ok: boolean; data?: { participant: { id: string } } }) => {
            if (res?.ok && res.data) {
              set({ myPlayerId: res.data.participant.id });
            }
          },
        );
      }
    });

    socket.on("disconnect", () => {
      set({ connectionStatus: "disconnected" });
    });

    socket.on("connect_error", (err: Error) => {
      set({ connectionStatus: "disconnected", errorMessage: `Connection error: ${err.message}` });
    });

    socket.on(
      "snapshot",
      (payload: {
        data: ClientGameView;
        chatLog?: ChatMessage[];
        activityLog?: ActivityEntry[];
      }) => {
        set((state) => {
          const prevView = state.currentView;
          const wasSessionStarted = Boolean(
            prevView?.isSessionStarted && prevView?.phase !== "lobby",
          );
          const isSessionEnded = Boolean(
            wasSessionStarted && !payload.data.isSessionStarted && payload.data.phase === "lobby",
          );

          const updates: Partial<GameStoreState> = {
            currentView: payload.data,
            roomCode: payload.data.roomCode,
          };
          if (isSessionEnded) {
            updates.activeModal = "standings";
          }
          if (payload.chatLog) updates.chatLog = payload.chatLog;
          if (payload.activityLog) updates.activityLog = payload.activityLog;
          return updates;
        });
      },
    );

    socket.on("chat", (payload: { message: ChatMessage }) => {
      const isFromMe = payload.message.senderId === get().myPlayerId;
      if (!isFromMe) {
        soundEngine.play("chat_pop");
      }
      set((state) => {
        const next = [...state.chatLog, payload.message].slice(-200);
        const unread = state.activeModal !== "chat" ? state.unreadChatCount + 1 : 0;
        return { chatLog: next, unreadChatCount: unread };
      });
    });

    socket.on("activity", (payload: { entry: ActivityEntry }) => {
      set((state) => ({
        activityLog: [...state.activityLog, payload.entry].slice(-200),
      }));
    });

    socket.on("presence", (payload: { playerId: string; isConnected: boolean }) => {
      set((state) => {
        if (!state.currentView) return state;
        const participants = state.currentView.participants.map((p: any) =>
          p.id === payload.playerId ? { ...p, isConnected: payload.isConnected } : p,
        );
        return {
          currentView: { ...state.currentView, participants },
        };
      });
    });

    socket.on("table:notification", (notif: TableNotification) => {
      set({ tableNotification: notif });
    });

    socket.on("room:closed", (payload: { reason?: string }) => {
      localStorage.removeItem(STORAGE_KEYS.ROOM);
      localStorage.removeItem(STORAGE_KEYS.TOKEN);
      set({
        roomCode: null,
        token: null,
        myPlayerId: null,
        currentView: null,
        activeModal: null,
        tableNotification: null,
        errorMessage: payload?.reason || "This table has been closed by the host.",
      });
    });

    socket.on("error", (err: ServerError) => {
      set({ errorMessage: err.message });
    });

    socketInstance = socket;
    set({ socket, connectionStatus: "connecting" });
    return socket;
  };

  const initialStored = getInitialStoredState();

  return {
    socket: null,
    connectionStatus: "disconnected",
    currentView: null,
    roomCode: initialStored.roomCode,
    myPlayerId: null,
    token: initialStored.token,
    displayName: initialStored.displayName,
    avatarId: initialStored.avatarId,
    chatLog: [],
    activityLog: [],
    unreadChatCount: 0,
    errorMessage: null,
    activeModal: null,
    selectedChip: 100,
    tableNotification: null,

    init: () => {
      const stored = getInitialStoredState();
      set({
        displayName: stored.displayName,
        avatarId: stored.avatarId,
        token: stored.token,
        roomCode: stored.roomCode,
      });

      ensureSocket();
    },

    dismissNotification: () => set({ tableNotification: null }),

    setProfile: (name: string, avatarId: string) => {
      localStorage.setItem(STORAGE_KEYS.NAME, name);
      localStorage.setItem(STORAGE_KEYS.AVATAR, avatarId);
      set({ displayName: name, avatarId });
    },

    openModal: (modal: ModalType) => {
      if (modal === "chat") {
        set({ activeModal: modal, unreadChatCount: 0 });
      } else {
        set({ activeModal: modal });
      }
    },

    closeModal: () => set({ activeModal: null }),
    clearError: () => set({ errorMessage: null }),
    setSelectedChip: (selectedChip: number) => set({ selectedChip }),

    createRoom: async (
      password?: string,
      config?: any,
      buyIn?: number,
      gameType: import("@felt/shared").GameType = "blackjack",
    ) => {
      const socket = ensureSocket();
      const { displayName, avatarId } = get();

      return new Promise<string>((resolve, reject) => {
        socket.emit(
          "room:create",
          { displayName, avatarId, password, config, buyIn, gameType },
          (res: {
            ok: boolean;
            data?: { roomCode: string; token: string; participant: { id: string } };
            error?: ServerError;
          }) => {
            if (res?.ok && res.data) {
              const { roomCode, token, participant } = res.data;
              localStorage.setItem(STORAGE_KEYS.TOKEN, token);
              localStorage.setItem(STORAGE_KEYS.ROOM, roomCode);
              set({
                roomCode,
                token,
                myPlayerId: participant.id,
                errorMessage: null,
              });
              resolve(roomCode);
            } else {
              const msg = res?.error?.message ?? "Failed to create room";
              set({ errorMessage: msg });
              reject(new Error(msg));
            }
          },
        );
      });
    },

    joinRoom: async (code: string, password?: string, buyIn?: number) => {
      const socket = ensureSocket();
      const { displayName, avatarId, token, roomCode: storedRoom } = get();
      const cleanCode = code.trim().toUpperCase();

      // Only pass token if it belongs to this room
      const activeToken = storedRoom === cleanCode && token ? token : undefined;

      return new Promise<void>((resolve, reject) => {
        socket.emit(
          "room:join",
          {
            code: cleanCode,
            displayName,
            avatarId,
            token: activeToken,
            password: password || undefined,
            buyIn,
          },
          (res: {
            ok: boolean;
            data?: { roomCode: string; token: string; participant: { id: string } };
            error?: ServerError;
          }) => {
            if (res?.ok && res.data) {
              const { roomCode, token: newToken, participant } = res.data;
              localStorage.setItem(STORAGE_KEYS.TOKEN, newToken);
              localStorage.setItem(STORAGE_KEYS.ROOM, roomCode);
              set({
                roomCode,
                token: newToken,
                myPlayerId: participant.id,
                errorMessage: null,
              });
              resolve();
            } else {
              const msg = res?.error?.message ?? "Failed to join room";
              set({ errorMessage: msg });
              reject(new Error(msg));
            }
          },
        );
      });
    },

    leaveRoom: () => {
      const { socket } = get();
      if (socket) {
        socket.emit("room:leave");
      }
      localStorage.removeItem(STORAGE_KEYS.ROOM);
      localStorage.removeItem(STORAGE_KEYS.TOKEN);
      set({
        roomCode: null,
        token: null,
        myPlayerId: null,
        currentView: null,
        chatLog: [],
        activityLog: [],
        activeModal: null,
      });
    },

    // In-room actions
    sit: (seat: number) => {
      const socket = ensureSocket();
      socket.emit("seat:sit", { seat });
    },

    stand: () => {
      const socket = ensureSocket();
      socket.emit("seat:stand");
    },

    startSession: () => {
      const socket = ensureSocket();
      socket.emit("host:startSession");
    },

    setDealer: (targetId: string) => {
      const socket = ensureSocket();
      socket.emit("host:setDealer", { targetId });
    },

    assignSeat: (targetId: string, seat: number | null) => {
      const socket = ensureSocket();
      socket.emit("host:assignSeat", { targetId, seat });
    },

    kick: (targetId: string) => {
      const socket = ensureSocket();
      socket.emit("host:kick", { targetId });
    },

    transferHost: (targetId: string) => {
      const socket = ensureSocket();
      socket.emit("host:transferHost", { targetId });
    },

    adjustChips: (target: string, op: "set" | "add" | "subtract", amount: number) => {
      const socket = ensureSocket();
      socket.emit("host:adjustChips", { target, op, amount });
    },

    updateConfig: (config: Partial<RoomConfig>) => {
      const socket = ensureSocket();
      socket.emit("host:updateConfig", { config });
    },

    pause: () => {
      const socket = ensureSocket();
      socket.emit("host:pause");
    },

    resume: () => {
      const socket = ensureSocket();
      socket.emit("host:resume");
    },

    endSession: () => {
      const socket = ensureSocket();
      socket.emit("host:endSession");
    },

    forceStand: () => {
      const socket = ensureSocket();
      socket.emit("host:forceStand");
    },

    cancelRound: () => {
      const socket = ensureSocket();
      socket.emit("host:cancelRound");
    },

    recoverDealer: (newDealerId: string) => {
      const socket = ensureSocket();
      socket.emit("host:recoverDealer", { newDealerId });
    },

    closeTable: () => {
      const socket = ensureSocket();
      socket.emit("host:closeTable");
    },

    // Betting actions
    betAdd: (amount: number) => {
      const socket = ensureSocket();
      socket.emit("bet:add", { amount });
    },

    betUndo: () => {
      const socket = ensureSocket();
      socket.emit("bet:undo");
    },

    betClear: () => {
      const socket = ensureSocket();
      socket.emit("bet:clear");
    },

    betRepeat: () => {
      const socket = ensureSocket();
      socket.emit("bet:repeat");
    },

    betLock: () => {
      const socket = ensureSocket();
      socket.emit("bet:lock");
    },

    betSitOut: () => {
      const socket = ensureSocket();
      socket.emit("bet:sitOut");
    },

    // Dealer actions
    dealerDeal: () => {
      const socket = ensureSocket();
      socket.emit("dealer:deal");
    },

    dealerReveal: () => {
      const socket = ensureSocket();
      socket.emit("dealer:reveal");
    },

    dealerDraw: () => {
      const socket = ensureSocket();
      socket.emit("dealer:draw");
    },

    dealerNextRound: () => {
      const socket = ensureSocket();
      socket.emit("dealer:nextRound");
    },

    dealerShuffle: () => {
      const socket = ensureSocket();
      socket.emit("dealer:shuffle");
    },

    // Player hand actions
    playHit: (handId: string) => {
      const socket = ensureSocket();
      socket.emit("play:hit", { handId });
    },

    playStand: (handId: string) => {
      const socket = ensureSocket();
      socket.emit("play:stand", { handId });
    },

    playDouble: (handId: string) => {
      const socket = ensureSocket();
      socket.emit("play:double", { handId });
    },

    playSplit: (handId: string) => {
      const socket = ensureSocket();
      socket.emit("play:split", { handId });
    },

    playInsurance: (handId: string, accept: boolean) => {
      const socket = ensureSocket();
      socket.emit("play:insurance", { handId, accept });
    },

    // Rebuy
    rebuyRequest: (amount?: number) => {
      const socket = ensureSocket();
      socket.emit("rebuy:request", { amount });
    },

    hostApproveRebuy: (targetId: string, amount?: number) => {
      const socket = ensureSocket();
      socket.emit("host:approveRebuy", { targetId, amount });
    },

    // Poker actions
    pokerFold: () => {
      const socket = ensureSocket();
      socket.emit("poker:fold");
    },
    pokerCheck: () => {
      const socket = ensureSocket();
      socket.emit("poker:check");
    },
    pokerCall: () => {
      const socket = ensureSocket();
      socket.emit("poker:call");
    },
    pokerBet: (amount: number) => {
      const socket = ensureSocket();
      socket.emit("poker:bet", { amount });
    },
    pokerRaise: (to: number) => {
      const socket = ensureSocket();
      socket.emit("poker:raise", { to });
    },
    pokerAllIn: () => {
      const socket = ensureSocket();
      socket.emit("poker:allIn");
    },
    pokerShowCards: () => {
      const socket = ensureSocket();
      socket.emit("poker:showCards");
    },
    pokerSeeCards: () => {
      const socket = ensureSocket();
      socket.emit("poker:seeCards");
    },
    pokerDealNextStreet: () => {
      const socket = ensureSocket();
      socket.emit("poker:dealNextStreet");
    },
    pokerNextHand: () => {
      const socket = ensureSocket();
      socket.emit("poker:nextHand");
    },
    pokerSitOut: () => {
      const socket = ensureSocket();
      socket.emit("poker:sitOut");
    },
    pokerSitIn: () => {
      const socket = ensureSocket();
      socket.emit("poker:sitIn");
    },

    // Chat
    sendChat: (text: string) => {
      soundEngine.play("chat_pop");
      const socket = ensureSocket();
      socket.emit("chat:send", { text });
    },
  };
});
