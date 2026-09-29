// Uses Web Crypto (globalThis.crypto) instead of Node's `crypto` module so this
// file can run in both the Node.js runtime and the Edge middleware runtime.

export const SESSION_COOKIE_NAME = "kargo_session";

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function isValidSessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token || !process.env.DASHBOARD_PASSWORD) return false;
  const expected = await sha256Hex(process.env.DASHBOARD_PASSWORD);
  return timingSafeEqualStr(token, expected);
}

/** Returns the session token to set as a cookie, or null if the password is wrong. */
export async function checkPassword(password: string): Promise<string | null> {
  if (!process.env.DASHBOARD_PASSWORD) return null;
  if (!timingSafeEqualStr(password, process.env.DASHBOARD_PASSWORD)) return null;
  return sha256Hex(process.env.DASHBOARD_PASSWORD);
}
