import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { ensureUserAccount } from "@/lib/userAccounts";
import type { UserRoleType } from "@/types/next-auth";

function isBcryptHash(value: string) {
  return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value);
}

async function findUserIdByEmail(
  email?: string | null,
): Promise<string | null> {
  if (!email) return null;

  const user = await prisma.user.findFirst({
    where: {
      email: {
        equals: email,
        mode: "insensitive",
      },
    },
    select: { id: true },
  });

  return user?.id ?? null;
}

async function updateUserActiveStatus(params: {
  userId?: string | null;
  email?: string | null;
  isActive: boolean;
  updateLastSeen?: boolean;
  context: "sign-in" | "sign-out";
}) {
  const resolvedUserId =
    params.userId && params.userId.length > 0
      ? params.userId
      : await findUserIdByEmail(params.email);

  if (!resolvedUserId) return;

  try {
    await prisma.user.update({
      where: { id: resolvedUserId },
      data: {
        isActive: params.isActive,
        ...(params.updateLastSeen ? { lastSeen: new Date() } : {}),
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    console.error(
      `Failed to update user active status on ${params.context}:`,
      error,
    );
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    // ─── Credentials (email/username + password) ─────────────────
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email or Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          console.log("Missing email or password in credentials");

          return null;
        }

        const loginIdentifier = credentials.email.trim();
        // Query by email OR username (matching existing FastAPI logic)
        console.log("thiyenawa1");
        let user;
        try {
          user = await prisma.user.findFirst({
            where: {
              OR: [
                {
                  email: {
                    equals: loginIdentifier,
                    mode: "insensitive",
                  },
                },
                {
                  username: {
                    equals: loginIdentifier,
                    mode: "insensitive",
                  },
                },
              ],
            },
          });
        } catch (error) {
          console.error("CRITICAL ERROR DURING PRISMA QUERY:", error);
          return null;
        }
        console.log("thiyenawa2");
        // Bootstrap an initial admin account from environment variables
        // when the users table is empty and the provided credentials match.
        if (!user) {
          const userCount = await prisma.user.count();
          const initialEmail = process.env.INITIAL_ADMIN_EMAIL?.trim();
          const initialPassword = process.env.INITIAL_ADMIN_PASSWORD;
          const initialName =
            process.env.INITIAL_ADMIN_NAME?.trim() || "System Admin";

          const canBootstrapAdmin =
            userCount === 0 &&
            Boolean(initialEmail) &&
            Boolean(initialPassword) &&
            initialEmail!.toLowerCase() === loginIdentifier.toLowerCase() &&
            credentials.password === initialPassword;

          if (canBootstrapAdmin) {
            const createdAdmin = await prisma.user.create({
              data: {
                email: initialEmail!,
                username: null,
                name: initialName,
                password: await hashPassword(initialPassword!),
                role: "admin",
              },
            });

            try {
              await ensureUserAccount(
                createdAdmin.id,
                createdAdmin.role,
                createdAdmin.name,
              );
            } catch (error) {
              console.error(
                "Initial admin bootstrap account setup failed:",
                error,
              );
            }

            user = createdAdmin;
          }
        }

        if (!user) {
          console.log("User not found");
          return null;
        }

        const storedPassword = String(user.password || "");

        let isValid = false;
        let shouldUpgradePasswordHash = false;
        console.log("ok");
        if (storedPassword.length > 0 && isBcryptHash(storedPassword)) {
          isValid = await verifyPassword(credentials.password, storedPassword);
          console.log("enterd password", credentials.password);
          console.log("stored hash", storedPassword);
        } else {
          // Backward compatibility for legacy local data that stored plain text passwords.
          isValid =
            storedPassword.length > 0 &&
            credentials.password === storedPassword;
          shouldUpgradePasswordHash = isValid;
        }

        if (!isValid) {
          console.log("Credentials validation failed for user.");
          return null;
        }

        // console.log("Credentials successfully passed for user:", user.email);

        if (shouldUpgradePasswordHash) {
          try {
            await prisma.user.update({
              where: { id: user.id },
              data: { password: await hashPassword(credentials.password) },
            });
          } catch (error) {
            console.error("Failed to upgrade legacy password hash:", error);
          }
        }

        // Keep login resilient: do not fail auth if this update fails.
        try {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              lastSeen: new Date(),
              isActive: true,
              updatedAt: new Date(),
            },
          });
        } catch (error) {
          console.error("Failed to update user lastSeen:", error);
        }

        return {
          id: String(user.id),
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),

    // ─── Google OAuth ────────────────────────────────────────────
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
  ],

  session: {
    strategy: "jwt",
    maxAge: (Number(process.env.ACCESS_TOKEN_EXPIRE_MINUTES) || 120) * 60,
  },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user.role as UserRoleType) || "employee";
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as UserRoleType) || "employee";
      }
      return session;
    },
  },

  events: {
    async signIn({ user, account, profile, isNewUser }) {
      await updateUserActiveStatus({
        userId: (user.id as string | undefined) ?? null,
        email: user.email,
        isActive: true,
        updateLastSeen: true,
        context: "sign-in",
      });

      // Audit Log for Sign-in
      const { logAuditAction, AuditAction } = await import("@/lib/auditLog");
      await logAuditAction({
        userId: user.id || "system",
        action: AuditAction.USER_LOGIN,
        resourceType: "User",
        resourceId: user.id || undefined,
        description: `User ${user.email} signed in`,
        status: "success",
      });
    },

    async signOut({ token, session }) {
      const sessionUser = session?.user as
        | { id?: string | null; email?: string | null }
        | undefined;

      const tokenId = typeof token?.id === "string" ? token.id : null;
      const tokenEmail = typeof token?.email === "string" ? token.email : null;

      const resolvedUserId = sessionUser?.id ?? tokenId;
      const resolvedEmail = sessionUser?.email ?? tokenEmail;

      await updateUserActiveStatus({
        userId: resolvedUserId,
        email: resolvedEmail,
        isActive: false,
        context: "sign-out",
      });

      if (resolvedUserId || resolvedEmail) {
        try {
          // Dynamic import because this is the NextAuth configuration block
          const { logAuditAction, AuditAction } =
            await import("@/lib/auditLog");

          await logAuditAction({
            userId: String(resolvedUserId || "unknown"),
            action: AuditAction.USER_LOGOUT,
            resourceType: "User",
            resourceId: String(resolvedUserId || "unknown"),
            description: `User ${resolvedEmail ?? resolvedUserId} signed out`,
            status: "success",
          });
        } catch (error) {
          console.error("[NextAuth signOut Audit Logging Error]", error);
        }
      }
    },
  },

  pages: {
    signIn: "/login",
  },

  secret: process.env.NEXTAUTH_SECRET,
};
