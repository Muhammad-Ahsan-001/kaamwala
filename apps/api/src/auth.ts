import type { User, WorkerProfile } from "@prisma/client";
import type { Role } from "@kaamwala/contracts";
import type { FastifyRequest } from "fastify";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./db";
import { env } from "./env";
import { badRequest, forbidden, unauthorized } from "./errors";

const secret = new TextEncoder().encode(env.JWT_SECRET);

export interface Claims {
  sub: string;
  role: Role;
  /** Seconds since the epoch. */
  exp: number | null;
}

export async function signToken(userId: string, role: Role): Promise<string> {
  return new SignJWT({ role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

export async function verifyToken(token: string): Promise<Claims | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    return payload.sub ? { sub: payload.sub, role: payload.role as Role, exp: payload.exp ?? null } : null;
  } catch {
    return null;
  }
}

export interface AuthContext {
  user: User;
  worker: WorkerProfile | null;
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

export async function requireAuth(req: FastifyRequest): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const claims = token ? await verifyToken(token) : null;
  if (!claims) throw unauthorized();
  const user = await prisma.user.findUnique({ where: { id: claims.sub }, include: { workerProfile: true } });
  if (!user) throw unauthorized();
  if (user.suspended) throw forbidden("This account is suspended.");
  const { workerProfile, ...rest } = user;
  req.auth = { user: rest, worker: workerProfile };
}

export const requireRole =
  (...roles: Role[]) =>
  async (req: FastifyRequest): Promise<void> => {
    await requireAuth(req);
    if (!roles.includes(authOf(req).user.role as Role)) throw forbidden();
  };

export function authOf(req: FastifyRequest): AuthContext {
  if (!req.auth) throw unauthorized();
  return req.auth;
}

/** Accepts 03001234567, 923001234567 and +923001234567, with or without separators. */
export function normalizePhone(input: string): string {
  const digits = input.replace(/[\s()-]/g, "");
  let phone = digits;
  if (/^0\d{10}$/.test(digits)) phone = `+92${digits.slice(1)}`;
  else if (/^92\d{10}$/.test(digits)) phone = `+${digits}`;
  if (!/^\+\d{10,15}$/.test(phone)) throw badRequest("INVALID_PHONE", "Enter a valid phone number.");
  return phone;
}
