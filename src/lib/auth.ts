import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getServerSession as getNextAuthSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import type { UserRole } from "@prisma/client";

function normalizeRole(role: unknown): string {
  return String(role || "").toLowerCase();
}

// ─── Password Utilities ─────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  plainPassword: string,
  hashedPassword: string
): Promise<boolean> {
  return bcrypt.compare(plainPassword, hashedPassword);
}

// ─── Session Helpers ─────────────────────────────────────────────

export async function getServerSession() {
  return getNextAuthSession(authOptions);
}

export async function requireAuth() {
  const session = await getServerSession();
  const sessionUser = session?.user as { id?: string } | undefined;
  if (!sessionUser?.id) {
    throw new AuthError(401, "Not authenticated");
  }

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
  });

  if (!user || !user.isActive) {
    throw new AuthError(401, "Could not validate credentials");
  }

  return user;
}

export async function requireAdmin() {
  const user = await requireAuth();
  const role = normalizeRole(user.role);
  if (role !== "admin" && role !== "financial_officer") {
    throw new AuthError(403, "Admin or Financial Officer access required");
  }
  return user;
}

export async function requireRole(...roles: UserRole[]) {
  const user = await requireAuth();
  const allowedRoles = roles.map((role) => normalizeRole(role));
  if (!allowedRoles.includes(normalizeRole(user.role))) {
    throw new AuthError(403, `Required role: ${roles.join(" or ")}`);
  }
  return user;
}

// ─── Error Class ─────────────────────────────────────────────────

export class AuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "AuthError";
  }
}
