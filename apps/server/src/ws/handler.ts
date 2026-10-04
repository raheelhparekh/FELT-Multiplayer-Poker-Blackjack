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
          config?: import("@felt/shared").RoomConfig;
          userToken?: string;
          actionId?: string;
        },
        ack?: (res: unknown) => void,
      ) => {
        try {
          const room = roomManager.createRoom({
            config: data.config,
            password: data.password,
            pacingEnabled: options.pacingEnabled,
          });

          const userId = data.userToken ? verifyToken(data.userToken)?.userId : undefined;

          const { participant, token } = room.join(socket, {
            displayName: data.displayName,
            avatarId: data.avatarId,
            password: data.password,
            userId,
          });

          socket.data.roomCode = room.roomCode;
          socket.data.playerId = participant.id;

          const response = {
            roomCode: room.roomCode,
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
          userToken?: string;
          actionId?: string;
        },
        ack?: (res: unknown) => void,
      ) => {
        try {
          const room = roomManager.getRoom(data.code);
          if (!room) {
            throw new EngineError("ILLEGAL_ACTION", `Room '${data.code}' not found`);
          }

          const userId = data.userToken ? verifyToken(data.userToken)?.userId : undefined;

          const { participant, token, isReconnect } = room.join(socket, {
            displayName: data.displayName,
            avatarId: data.avatarId,
            token: data.token,
            password: data.password,
            userId,
          });

          socket.data.roomCode = room.roomCode;
          socket.data.playerId = participant.id;

          const response = {
            roomCode: room.roomCode,
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
      (data: { targetId: string; actionId?: string }, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.approveRebuy(playerId, data.targetId);
          if (ack) ack({ ok: true });
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
      (data: { actionId?: string } | undefined, ack?: (res: unknown) => void) => {
        try {
          const { room, playerId } = getRoomAndPlayer();
          room.dispatch(playerId, { type: "rebuy:request", playerId }, data?.actionId);
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
