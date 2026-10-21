import { EngineError } from "@felt/shared";
import type { Socket, Server as SocketIOServer } from "socket.io";
import { verifyToken } from "../auth/crypto.js";
import type { RoomManager } from "../rooms/room-manager.js";
import type { Room } from "../rooms/room.js";

export function setupSocketIO(
  io: SocketIOServer,
  roomManager: RoomManager,
  options: { pacingEnabled?: boolean } = {},
): void {
  io.on("connection", (socket: Socket) => {
    const getRoomAndPlayer = (): { room: Room; playerId: string } => {
      const roomCode = socket.data.roomCode as string | undefined;
      const playerId = socket.data.playerId as string | undefined;

      if (!roomCode || !playerId) {
        throw new EngineError("ILLEGAL_ACTION", "Not connected to a room");
      }

      const room = roomManager.getRoom(roomCode);
      if (!room) {
        throw new EngineError("ILLEGAL_ACTION", "Room not found");
      }

      return { room, playerId };
    };

    const handleError = (err: unknown, actionId?: string, ack?: (res: unknown) => void) => {
      let code = "SERVER_ERROR";
      let message = "An internal server error occurred";

      if (err instanceof EngineError) {
        code = (err as EngineError).code;
        message = (err as EngineError).message;
      } else if (err instanceof Error) {
        message = (err as Error).message;
      } else if (typeof err === "object" && err !== null && "message" in err) {
        message = String((err as { message: unknown }).message);
      } else if (typeof err === "string") {
        message = err;
      }

      socket.emit("error", {
        type: "error",
        code,
        message,
        actionId,
      });

      if (ack) {
        ack({ ok: false, error: { code, message, actionId } });
      }
    };

    // ─── Room Creation / Join / Leave ───────────────────────────────────────

    socket.on(
      "room:create",
      (
        data: {
          displayName: string;
          avatarId: string;
          password?: string;
          gameType?: import("@felt/shared").GameType;
          config?: import("@felt/shared").RoomConfig;
          buyIn?: number;
          userToken?: string;
          actionId?: string;
        },
        ack?: (res: unknown) => void,
      ) => {
        try {
          const room = roomManager.createRoom({
            gameType: data.gameType,
            config: data.config,
            password: data.password,
            pacingEnabled: options.pacingEnabled,
          });

          const userId = data.userToken ? verifyToken(data.userToken)?.userId : undefined;

          const { participant, token } = room.join(socket, {
            displayName: data.displayName,
            avatarId: data.avatarId,
            password: data.password,
            buyIn: data.buyIn,
            userId,
          });

          socket.data.roomCode = room.roomCode;
          socket.data.playerId = participant.id;

          const response = {
            roomCode: room.roomCode,
            gameType: room.gameType,
            token,
            participant,
          };

          socket.emit("room:created", response);
          if (ack) ack({ ok: true, data: response });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "room:join",
      (
        data: {
          code: string;
          displayName: string;
          avatarId: string;
          token?: string;
          password?: string;
          buyIn?: number;
          userToken?: string;
          actionId?: string;
        },
        ack?: (res: unknown) => void,
      ) => {
        try {
          const room = roomManager.getRoom(data.code);
          if (!room) {
            // Clear stored room/token so client shows a clean error
            socket.emit("room:not_found", {
              type: "room:not_found",
              code: data.code?.toUpperCase(),
              message: "This table has closed or expired. Ask the host for a new invite.",
            });
            if (ack)
              ack({
                ok: false,
                error: {
                  code: "ROOM_NOT_FOUND",
                  message: "This table has closed or expired. Ask the host for a new invite.",
                },
              });
            return;
          }

          const userId = data.userToken ? verifyToken(data.userToken)?.userId : undefined;

          const { participant, token, isReconnect } = room.join(socket, {
            displayName: data.displayName,
            avatarId: data.avatarId,
            token: data.token,
            password: data.password,
            buyIn: data.buyIn,
            userId,
          });

          socket.data.roomCode = room.roomCode;
          socket.data.playerId = participant.id;

          const response = {
            roomCode: room.roomCode,
            gameType: room.gameType,
            token,
            participant,
            isReconnect,
          };

          socket.emit("room:joined", response);
          if (ack) ack({ ok: true, data: response });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "user:claim",
      (data: { userToken: string; actionId?: string }, ack?: (res: unknown) => void) => {
        try {
          const verified = verifyToken(data.userToken);
          if (!verified) {
            throw new EngineError("ILLEGAL_ACTION", "Invalid user token");
          }
          const { room, playerId } = getRoomAndPlayer();
          room.claimUser(playerId, verified.userId);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on("room:leave", (_data: unknown, ack?: (res: unknown) => void) => {
      try {
        const roomCode = socket.data.roomCode as string | undefined;
        if (roomCode) {
          const room = roomManager.getRoom(roomCode);
          if (room) {
            room.leave(socket.id);
          }
        }
        socket.data.roomCode = undefined;
        socket.data.playerId = undefined;
        if (ack) ack({ ok: true });
      } catch (err) {
        handleError(err, undefined, ack);
      }
    });

    // ─── Seat Management ─────────────────────────────────────────────────────

    socket.on(
      "seat:sit",
      (data: { seat: number; actionId?: string }, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.sit(playerId, data.seat);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "seat:stand",
      (data: { actionId?: string } | undefined, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.stand(playerId);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    // ─── Host Controls ───────────────────────────────────────────────────────

    socket.on(
      "host:setDealer",
      (data: { targetId: string; actionId?: string }, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.setDealer(playerId, data.targetId);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "host:assignSeat",
      (
        data: { targetId: string; seat: number | null; actionId?: string },
        ack?: (res: unknown) => void,
      ) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.assignSeat(playerId, data.targetId, data.seat);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "host:kick",
      (data: { targetId: string; actionId?: string }, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.kick(playerId, data.targetId);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "host:transferHost",
      (data: { targetId: string; actionId?: string }, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.transferHost(playerId, data.targetId);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "host:adjustChips",
      (
        data: {
          target: string;
          op: "set" | "add" | "subtract";
          amount: number;
          actionId?: string;
        },
        ack?: (res: unknown) => void,
      ) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.adjustChips(playerId, data.target, data.op, data.amount);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "host:updateConfig",
      (
        data: { config: Partial<import("@felt/shared").RoomConfig>; actionId?: string },
        ack?: (res: unknown) => void,
      ) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.updateConfig(playerId, data.config);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "host:startSession",
      (data: { actionId?: string } | undefined, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.startSession(playerId);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "host:pause",
      (data: { actionId?: string } | undefined, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.pause(playerId);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "host:resume",
      (data: { actionId?: string } | undefined, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.resume(playerId);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "host:endSession",
      (data: { actionId?: string } | undefined, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.endSession(playerId);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "host:approveRebuy",
      (
        data: { targetId: string; amount?: number; actionId?: string },
        ack?: (res: unknown) => void,
      ) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.approveRebuy(playerId, data.targetId, data.amount);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "host:rejectRebuy",
      (
        data: { targetId: string; actionId?: string },
        ack?: (res: unknown) => void,
      ) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.rejectRebuy(playerId, data.targetId);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    // ─── Host Recovery Controls ───────────────────────────────────────────────

    socket.on(
      "host:forceStand",
      (data: { actionId?: string } | undefined, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.forceStandActiveHand(playerId);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "host:cancelRound",
      (data: { actionId?: string } | undefined, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.cancelRoundRefund(playerId);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "host:recoverDealer",
      (data: { newDealerId: string; actionId?: string }, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.recoverDealer(playerId, data.newDealerId);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "host:closeTable",
      (data: { actionId?: string } | undefined, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          if (ack) ack({ ok: true });
          room.closeTable(playerId);
          socket.data.roomCode = undefined;
          socket.data.playerId = undefined;
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    // ─── Betting Actions ─────────────────────────────────────────────────────

    socket.on(
      "bet:add",
      (data: { amount: number; actionId?: string }, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.dispatch(
            playerId,
            { type: "bet:add", playerId, amount: data.amount },
            data.actionId,
          );
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "bet:undo",
      (data: { actionId?: string } | undefined, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.dispatch(playerId, { type: "bet:undo", playerId }, data?.actionId);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "bet:clear",
      (data: { actionId?: string } | undefined, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.dispatch(playerId, { type: "bet:clear", playerId }, data?.actionId);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "bet:repeat",
      (data: { actionId?: string } | undefined, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.dispatch(playerId, { type: "bet:repeat", playerId }, data?.actionId);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "bet:lock",
      (data: { actionId?: string } | undefined, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.dispatch(playerId, { type: "bet:lock", playerId }, data?.actionId);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "bet:sitOut",
      (data: { actionId?: string } | undefined, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.dispatch(playerId, { type: "bet:sitOut", playerId }, data?.actionId);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    // ─── Dealer Controls ─────────────────────────────────────────────────────

    socket.on(
      "dealer:deal",
      (data: { actionId?: string } | undefined, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.dispatch(playerId, { type: "dealer:deal", dealerId: playerId }, data?.actionId);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "dealer:reveal",
      (data: { actionId?: string } | undefined, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.dispatch(playerId, { type: "dealer:reveal", dealerId: playerId }, data?.actionId);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "dealer:draw",
      (data: { actionId?: string } | undefined, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.dispatch(playerId, { type: "dealer:draw", dealerId: playerId }, data?.actionId);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "dealer:nextRound",
      (data: { actionId?: string } | undefined, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.dispatch(playerId, { type: "dealer:nextRound", actorId: playerId }, data?.actionId);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "dealer:shuffle",
      (data: { actionId?: string } | undefined, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.dispatch(playerId, { type: "dealer:shuffle", dealerId: playerId }, data?.actionId);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    // ─── Player Hand Actions ─────────────────────────────────────────────────

    socket.on(
      "play:hit",
      (data: { handId: string; actionId?: string }, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.dispatch(
            playerId,
            { type: "play:hit", playerId, handId: data.handId },
            data.actionId,
          );
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "play:stand",
      (data: { handId: string; actionId?: string }, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.dispatch(
            playerId,
            { type: "play:stand", playerId, handId: data.handId },
            data.actionId,
          );
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "play:double",
      (data: { handId: string; actionId?: string }, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.dispatch(
            playerId,
            { type: "play:double", playerId, handId: data.handId },
            data.actionId,
          );
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "play:split",
      (data: { handId: string; actionId?: string }, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.dispatch(
            playerId,
            { type: "play:split", playerId, handId: data.handId },
            data.actionId,
          );
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "play:insurance",
      (
        data: { handId: string; accept: boolean; actionId?: string },
        ack?: (res: unknown) => void,
      ) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.dispatch(
            playerId,
            { type: "play:insurance", playerId, handId: data.handId, accept: data.accept },
            data.actionId,
          );
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    // ─── Rebuy ───────────────────────────────────────────────────────────────

    socket.on(
      "rebuy:request",
      (data: { amount?: number; actionId?: string } | undefined, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.dispatch(
            playerId,
            { type: "rebuy:request", playerId, amount: data?.amount },
            data?.actionId,
          );
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    // ─── Poker Actions ───────────────────────────────────────────────────────

    socket.on(
      "poker:action",
      (
        data: {
          action: "fold" | "check" | "call" | "bet" | "raise" | "allIn";
          amount?: number;
          to?: number;
          actionId?: string;
        },
        ack?: (res: unknown) => void,
      ) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          let action: any;
          if (data.action === "fold") action = { type: "poker:fold", playerId };
          else if (data.action === "check") action = { type: "poker:check", playerId };
          else if (data.action === "call") action = { type: "poker:call", playerId };
          else if (data.action === "bet") action = { type: "poker:bet", playerId, amount: data.amount ?? 0 };
          else if (data.action === "raise") action = { type: "poker:raise", playerId, to: data.to ?? data.amount ?? 0 };
          else if (data.action === "allIn") action = { type: "poker:allIn", playerId };
          else if (data.action === "seeCards") action = { type: "poker:seeCards", playerId };
          else throw new EngineError("ILLEGAL_ACTION", `Unknown poker action: ${data.action}`);

          room.dispatch(playerId, action, data.actionId);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "poker:fold",
      (data: { actionId?: string } | undefined, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.dispatch(playerId, { type: "poker:fold", playerId }, data?.actionId);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "poker:check",
      (data: { actionId?: string } | undefined, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.dispatch(playerId, { type: "poker:check", playerId }, data?.actionId);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "poker:call",
      (data: { actionId?: string } | undefined, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.dispatch(playerId, { type: "poker:call", playerId }, data?.actionId);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "poker:bet",
      (data: { amount: number; actionId?: string }, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.dispatch(
            playerId,
            { type: "poker:bet", playerId, amount: data.amount },
            data.actionId,
          );
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "poker:raise",
      (
        data: { to?: number; amount?: number; actionId?: string },
        ack?: (res: unknown) => void,
      ) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.dispatch(
            playerId,
            { type: "poker:raise", playerId, to: data.to ?? data.amount ?? 0 },
            data.actionId,
          );
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "poker:allIn",
      (data: { actionId?: string } | undefined, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.dispatch(playerId, { type: "poker:allIn", playerId }, data?.actionId);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "poker:showCards",
      (data: { actionId?: string } | undefined, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.dispatch(playerId, { type: "poker:showCards", playerId }, data?.actionId);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "poker:seeCards",
      (data: { actionId?: string } | undefined, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.dispatch(playerId, { type: "poker:seeCards", playerId }, data?.actionId);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "poker:dealNextStreet",
      (data: { actionId?: string } | undefined, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.dispatch(playerId, { type: "poker:dealNextStreet", actorId: playerId }, data?.actionId);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "poker:nextHand",
      (data: { actionId?: string } | undefined, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.dispatch(playerId, { type: "poker:nextHand", actorId: playerId }, data?.actionId);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "poker:startHand",
      (data: { actionId?: string } | undefined, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.dispatch(playerId, { type: "poker:startHand", actorId: playerId }, data?.actionId);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "poker:sitOut",
      (data: { actionId?: string } | undefined, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.dispatch(playerId, { type: "poker:sitOut", playerId }, data?.actionId);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    socket.on(
      "poker:sitIn",
      (data: { actionId?: string } | undefined, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.dispatch(playerId, { type: "poker:sitIn", playerId }, data?.actionId);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    // ─── Chat ────────────────────────────────────────────────────────────────

    socket.on(
      "chat:send",
      (data: { text: string; actionId?: string }, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.sendChat(playerId, data.text);
          if (ack) ack({ ok: true });
        } catch (err) {
          handleError(err, data?.actionId, ack);
        }
      },
    );

    // ─── Disconnect ──────────────────────────────────────────────────────────

    socket.on("disconnect", () => {
      const roomCode = socket.data.roomCode as string | undefined;
      if (roomCode) {
        const room = roomManager.getRoom(roomCode);
        if (room) {
          room.handleDisconnect(socket.id);
        }
      }
    });
  });
}
