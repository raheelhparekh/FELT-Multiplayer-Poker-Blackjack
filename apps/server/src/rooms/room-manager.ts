import { randomInt } from "node:crypto";
import { ROOM, type RoomConfig } from "@felt/shared";
import { dbService } from "../db/index.js";
import { Room } from "./room.js";

export interface CreateRoomOptions {
  config?: RoomConfig | undefined;
  password?: string | undefined;
  pacingEnabled?: boolean | undefined;
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  public generateRoomCode(): string {
    const alphabet = ROOM.CODE_ALPHABET;
    const len = ROOM.CODE_LENGTH;

    for (let attempt = 0; attempt < 100; attempt++) {
      let code = "";
      for (let i = 0; i < len; i++) {
        const idx = randomInt(0, alphabet.length);
        code += alphabet[idx];
      }
      if (!this.rooms.has(code)) {
        return code;
      }
    }

    throw new Error("Failed to generate a unique room code after 100 attempts");
  }

  public createRoom(options: CreateRoomOptions = {}): Room {
    const code = this.generateRoomCode();
    const room = new Room({
      roomCode: code,
      config: options.config,
      password: options.password,
      pacingEnabled: options.pacingEnabled,
      onEmptyRoomDestroy: (roomCode) => this.removeRoom(roomCode),
    });

    this.rooms.set(code, room);
    return room;
  }

  public getRoom(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  public removeRoom(code: string): boolean {
    const upper = code.toUpperCase();
    const room = this.rooms.get(upper);
    if (!room) return false;

    room.destroy();
    return this.rooms.delete(upper);
  }

  public getActiveRoomCount(): number {
    return this.rooms.size;
  }

  public async saveAllSnapshots(): Promise<void> {
    for (const room of this.rooms.values()) {
      try {
        const json = room.serialize();
        await dbService.saveRoomSnapshot(room.roomCode, json);
      } catch {
        // Continue saving other rooms
      }
    }
  }

  public async restoreSnapshots(): Promise<number> {
    try {
      const snapshots = await dbService.getRoomSnapshots();
      let restoredCount = 0;
      for (const snap of snapshots) {
        if (!this.rooms.has(snap.roomCode)) {
          const room = Room.deserialize(snap.snapshotJson, {
            onEmptyRoomDestroy: (code) => this.removeRoom(code),
          });
          this.rooms.set(snap.roomCode, room);
          restoredCount++;
        }
      }
      return restoredCount;
    } catch {
      return 0;
    }
  }

  public destroy(): void {
    for (const room of this.rooms.values()) {
      room.destroy();
    }
    this.rooms.clear();
  }
}
