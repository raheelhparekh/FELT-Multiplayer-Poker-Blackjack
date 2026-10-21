import type {
  ActivityEntry,
  ChatMessage,
  ClientGameView,
  GameEvent,
  GamePhase,
  Participant,
  RoomConfig,
  ServerError,
} from "@felt/shared";
import { type Socket, io } from "socket.io-client";

export class TestClient {
  public socket: Socket | null = null;
  public playerId = "";
  public token = "";
  public roomCode = "";
  public displayName = "";
  public latestSnapshot: any = null;

  public receivedSnapshots: Array<{ seq: number; data: any }> = [];
  public receivedEvents: GameEvent[] = [];
  public receivedActivities: ActivityEntry[] = [];
  public receivedChats: ChatMessage[] = [];
  public receivedErrors: ServerError[] = [];
  public presenceUpdates: Array<{ playerId: string; isConnected: boolean }> = [];
  public receivedNotifications: import("@felt/shared").TableNotification[] = [];

  constructor(public readonly name: string) {}

  public async connect(serverUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io(serverUrl, {
        transports: ["websocket"],
        autoConnect: true,
        forceNew: true,
      });

      this.socket.on("connect", () => {
        resolve();
      });

      this.socket.on("connect_error", (err) => {
        reject(err);
      });

      this.socket.on("snapshot", (payload: { seq: number; data: any }) => {
        this.latestSnapshot = { ...payload.data, seq: payload.seq ?? payload.data?.seq };
        this.receivedSnapshots.push(payload);
      });

      this.socket.on("events", (payload: { seq: number; events: GameEvent[] }) => {
        this.receivedEvents.push(...payload.events);
      });

      this.socket.on("activity", (payload: { type: string; entry: ActivityEntry }) => {
        this.receivedActivities.push(payload.entry);
      });

      this.socket.on("chat", (payload: { type: string; message: ChatMessage }) => {
        this.receivedChats.push(payload.message);
      });

      this.socket.on("table:notification", (notif: import("@felt/shared").TableNotification) => {
        this.receivedNotifications.push(notif);
      });

      this.socket.on("error", (err: ServerError) => {
        this.receivedErrors.push(err);
      });

      this.socket.on(
        "presence",
        (update: { type: string; playerId: string; isConnected: boolean }) => {
          this.presenceUpdates.push({
            playerId: update.playerId,
            isConnected: update.isConnected,
          });
        },
      );
    });
  }

  public async createRoom(params: {
    displayName: string;
    avatarId: string;
    password?: string;
    gameType?: import("@felt/shared").GameType;
    config?: any;
    buyIn?: number;
  }): Promise<{ roomCode: string; token: string; participant: Participant }> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error("Socket not connected"));
      this.displayName = params.displayName;

      this.socket.emit(
        "room:create",
        params,
        (res: {
          ok: boolean;
          data?: { roomCode: string; token: string; participant: Participant };
          error?: ServerError;
        }) => {
          if (!res?.ok || !res.data) {
            return reject(new Error(res?.error?.message ?? "Failed to create room"));
          }
          this.roomCode = res.data.roomCode;
          this.token = res.data.token;
          this.playerId = res.data.participant.id;
          resolve(res.data);
        },
      );
    });
  }

  public async pokerFold(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket?.emit("poker:fold", {}, (res: { ok: boolean; error?: ServerError }) => {
        if (!res?.ok) return reject(new Error(res?.error?.message ?? "poker:fold failed"));
        resolve();
      });
    });
  }

  public async pokerCheck(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket?.emit("poker:check", {}, (res: { ok: boolean; error?: ServerError }) => {
        if (!res?.ok) return reject(new Error(res?.error?.message ?? "poker:check failed"));
        resolve();
      });
    });
  }

  public async pokerCall(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket?.emit("poker:call", {}, (res: { ok: boolean; error?: ServerError }) => {
        if (!res?.ok) return reject(new Error(res?.error?.message ?? "poker:call failed"));
        resolve();
      });
    });
  }

  public async pokerBet(amount: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket?.emit("poker:bet", { amount }, (res: { ok: boolean; error?: ServerError }) => {
        if (!res?.ok) return reject(new Error(res?.error?.message ?? "poker:bet failed"));
        resolve();
      });
    });
  }

  public async pokerRaise(to: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket?.emit("poker:raise", { to }, (res: { ok: boolean; error?: ServerError }) => {
        if (!res?.ok) return reject(new Error(res?.error?.message ?? "poker:raise failed"));
        resolve();
      });
    });
  }

  public async pokerAllIn(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket?.emit("poker:allIn", {}, (res: { ok: boolean; error?: ServerError }) => {
        if (!res?.ok) return reject(new Error(res?.error?.message ?? "poker:allIn failed"));
        resolve();
      });
    });
  }

  public async pokerShowCards(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket?.emit("poker:showCards", {}, (res: { ok: boolean; error?: ServerError }) => {
        if (!res?.ok) return reject(new Error(res?.error?.message ?? "poker:showCards failed"));
        resolve();
      });
    });
  }

  public async pokerSeeCards(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket?.emit("poker:seeCards", {}, (res: { ok: boolean; error?: ServerError }) => {
        if (!res?.ok) return reject(new Error(res?.error?.message ?? "poker:seeCards failed"));
        resolve();
      });
    });
  }

  public async pokerNextHand(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket?.emit("poker:nextHand", {}, (res: { ok: boolean; error?: ServerError }) => {
        if (!res?.ok) return reject(new Error(res?.error?.message ?? "poker:nextHand failed"));
        resolve();
      });
    });
  }

  public async joinRoom(params: {
    code: string;
    displayName: string;
    avatarId: string;
    token?: string;
    password?: string;
  }): Promise<{
    roomCode: string;
    token: string;
    participant: Participant;
    isReconnect?: boolean;
  }> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error("Socket not connected"));
      this.displayName = params.displayName;

      this.socket.emit(
        "room:join",
        params,
        (res: {
          ok: boolean;
          data?: {
            roomCode: string;
            token: string;
            participant: Participant;
            isReconnect?: boolean;
          };
          error?: ServerError;
        }) => {
          if (!res?.ok || !res.data) {
            return reject(new Error(res?.error?.message ?? "Failed to join room"));
          }
          this.roomCode = res.data.roomCode;
          this.token = res.data.token;
          this.playerId = res.data.participant.id;
          resolve(res.data);
        },
      );
    });
  }

  public emitIntent(event: string, payload: unknown = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error("Socket not connected"));
      this.socket.emit(event, payload, (res: { ok: boolean; error?: ServerError }) => {
        if (res && !res.ok) {
          return reject(new Error(res.error?.message ?? `Action ${event} failed`));
        }
        resolve();
      });
    });
  }

  public sit(seat: number): Promise<void> {
    return this.emitIntent("seat:sit", { seat });
  }

  public stand(): Promise<void> {
    return this.emitIntent("seat:stand");
  }

  public setDealer(targetId: string): Promise<void> {
    return this.emitIntent("host:setDealer", { targetId });
  }

  public assignSeat(targetId: string, seat: number | null): Promise<void> {
    return this.emitIntent("host:assignSeat", { targetId, seat });
  }

  public startSession(): Promise<void> {
    return this.emitIntent("host:startSession");
  }

  public pause(): Promise<void> {
    return this.emitIntent("host:pause");
  }

  public resume(): Promise<void> {
    return this.emitIntent("host:resume");
  }

  public kick(targetId: string): Promise<void> {
    return this.emitIntent("host:kick", { targetId });
  }

  public transferHost(targetId: string): Promise<void> {
    return this.emitIntent("host:transferHost", { targetId });
  }

  public adjustChips(
    target: string,
    op: "set" | "add" | "subtract",
    amount: number,
  ): Promise<void> {
    return this.emitIntent("host:adjustChips", { target, op, amount });
  }

  public forceStandActiveHand(): Promise<void> {
    return this.emitIntent("host:forceStand");
  }

  public cancelRoundRefund(): Promise<void> {
    return this.emitIntent("host:cancelRound");
  }

  public recoverDealer(newDealerId: string): Promise<void> {
    return this.emitIntent("host:recoverDealer", { newDealerId });
  }

  public closeTable(): Promise<void> {
    return this.emitIntent("host:closeTable");
  }

  public updateConfig(config: Record<string, unknown>): Promise<void> {
    return this.emitIntent("host:updateConfig", { config });
  }

  public betAdd(amount: number): Promise<void> {
    return this.emitIntent("bet:add", { amount });
  }

  public betUndo(): Promise<void> {
    return this.emitIntent("bet:undo");
  }

  public betClear(): Promise<void> {
    return this.emitIntent("bet:clear");
  }

  public betRepeat(): Promise<void> {
    return this.emitIntent("bet:repeat");
  }

  public betLock(): Promise<void> {
    return this.emitIntent("bet:lock");
  }

  public betSitOut(): Promise<void> {
    return this.emitIntent("bet:sitOut");
  }

  public dealerDeal(): Promise<void> {
    return this.emitIntent("dealer:deal");
  }

  public dealerReveal(): Promise<void> {
    return this.emitIntent("dealer:reveal");
  }

  public dealerNextRound(): Promise<void> {
    return this.emitIntent("dealer:nextRound");
  }

  public playHit(handId: string): Promise<void> {
    return this.emitIntent("play:hit", { handId });
  }

  public playStand(handId: string): Promise<void> {
    return this.emitIntent("play:stand", { handId });
  }

  public playDouble(handId: string): Promise<void> {
    return this.emitIntent("play:double", { handId });
  }

  public playSplit(handId: string): Promise<void> {
    return this.emitIntent("play:split", { handId });
  }

  public playInsurance(handId: string, accept: boolean): Promise<void> {
    return this.emitIntent("play:insurance", { handId, accept });
  }

  public rebuyRequest(amount?: number): Promise<void> {
    return this.emitIntent("rebuy:request", { amount });
  }

  public hostApproveRebuy(targetId: string, amount?: number): Promise<void> {
    return this.emitIntent("host:approveRebuy", { targetId, amount });
  }

  public hostRejectRebuy(targetId: string): Promise<void> {
    return this.emitIntent("host:rejectRebuy", { targetId });
  }

  public sendChat(text: string): Promise<void> {
    return this.emitIntent("chat:send", { text });
  }

  public async waitForSnapshot(
    predicate: (view: ClientGameView) => boolean,
    timeoutMs = 5000,
  ): Promise<ClientGameView> {
    if (this.latestSnapshot && predicate(this.latestSnapshot)) {
      return this.latestSnapshot;
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            `Timeout (${timeoutMs}ms) waiting for snapshot condition. Latest phase: ${this.latestSnapshot?.phase}`,
          ),
        );
      }, timeoutMs);

      const handler = (payload: { data: ClientGameView }) => {
        if (predicate(payload.data)) {
          cleanup();
          resolve(payload.data);
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.socket?.off("snapshot", handler);
      };

      this.socket?.on("snapshot", handler);
    });
  }

  public async waitForPhase(phase: GamePhase, timeoutMs = 5000): Promise<ClientGameView> {
    return this.waitForSnapshot((v) => v.phase === phase, timeoutMs);
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}
