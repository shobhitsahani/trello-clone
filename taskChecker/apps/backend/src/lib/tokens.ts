/** JWT (access) tokens with jose; refresh/invite tokens are random, stored
 * hashed. Tenancy comes from the token: `tid` claim = active org of the session.
 * Issuing/refreshing validates membership FIRST (via memberships_for_user),
 * so a token can never carry a tenant the user doesn't belong to. */
import { jwtVerify, SignJWT } from "jose";
import { config } from "../config.js";
import type { Role } from "./rbac.js";

export interface AccessClaims {
  sub: string; // user id
  tid: string; // tenant id (the session's active org)
  role: Role; // cached membership role at issue time
}

const encoder = new TextEncoder();
const alg = "HS256";

export async function signAccessToken(claims: AccessClaims): Promise<string> {
  const secret = encoder.encode(config().jwtSecret);
  return new SignJWT({ tid: claims.tid, role: claims.role })
    .setProtectedHeader({ alg })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(config().accessTokenTtl)
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, encoder.encode(config().jwtSecret), { algorithms: [alg] });
    if (typeof payload.sub !== "string" || typeof payload.tid !== "string") return null;
    const role = payload.role as Role;
    return { sub: payload.sub, tid: payload.tid, role };
  } catch {
    return null;
  }
}