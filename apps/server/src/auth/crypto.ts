import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const JWT_SECRET =
  process.env["JWT_SECRET"] || "felt-development-insecure-jwt-secret-do-not-use-in-prod";

/**
 * Hash a plain password using scrypt with random salt.
 * Format: "scrypt$<salt_hex>$<derived_hex>"
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, 64);
  return `scrypt$${salt}$${derivedKey.toString("hex")}`;
}

/**
 * Verify a plain password against a stored scrypt hash.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const parts = storedHash.split("$");
    if (parts.length !== 3 || parts[0] !== "scrypt") return false;

    const salt = parts[1];
    const key = parts[2];
    if (!salt || !key) return false;

    const derivedKey = scryptSync(password, salt, 64);
    const storedBuf = Buffer.from(key, "hex");

    return timingSafeEqual(derivedKey, storedBuf);
  } catch {
    return false;
  }
}

export interface UserTokenPayload {
  userId: string;
  email: string;
  username: string;
  avatarId: string;
  iat: number;
  exp: number;
}

/**
 * Create a signed JWT using HMAC-SHA256.
 */
export function createToken(
  user: { id: string; email: string; username: string; avatarId: string },
  expiresInDays = 30,
): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload: UserTokenPayload = {
    userId: user.id,
    email: user.email,
    username: user.username,
    avatarId: user.avatarId,
    iat: now,
    exp: now + expiresInDays * 86400,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", JWT_SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");

  return `${header}.${body}.${signature}`;
}

/**
 * Verify and decode a JWT.
 */
export function verifyToken(token: string): UserTokenPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [header, body, signature] = parts;
    if (!header || !body || !signature) return null;

    const expectedSig = createHmac("sha256", JWT_SECRET)
      .update(`${header}.${body}`)
      .digest("base64url");
    if (expectedSig !== signature) return null;

    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as UserTokenPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}
