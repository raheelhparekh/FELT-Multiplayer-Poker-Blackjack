import { createHmac, timingSafeEqual } from "node:crypto";

export interface GuestTokenPayload {
  playerId: string;
  roomCode: string;
  displayName: string;
  avatarId: string;
  createdAt: number;
}

const DEFAULT_SECRET = "felt-insecure-dev-secret-key-change-in-prod";

export function getJwtSecret(): string {
  return process.env["JWT_SECRET"] || DEFAULT_SECRET;
}

export function createGuestToken(
  payload: Omit<GuestTokenPayload, "createdAt">,
  secret = getJwtSecret(),
): string {
  const fullPayload: GuestTokenPayload = {
    ...payload,
    createdAt: Date.now(),
  };

  const data = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");
  const hmac = createHmac("sha256", secret).update(data).digest("base64url");

  return `${data}.${hmac}`;
}

export function verifyGuestToken(token: string, secret = getJwtSecret()): GuestTokenPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [data, sig] = parts as [string, string];

    const expectedSig = createHmac("sha256", secret).update(data).digest("base64url");

    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);

    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const json = Buffer.from(data, "base64url").toString("utf-8");
    return JSON.parse(json) as GuestTokenPayload;
  } catch {
    return null;
  }
}
