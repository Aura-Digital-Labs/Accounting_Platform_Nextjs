import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { ensureUserAccount } from "@/lib/userAccounts";
import type { UserRoleType } from "@/types/next-auth";

export const authOptions: NextAuthOptions = {
  providers: [
    // ─── Credentials (email/username + password) ─────────────────
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Email or Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;

        const loginIdentifier = credentials.username.trim();

        // Query by email OR username (matching existing FastAPI logic)
        let user = await prisma.user.findFirst({
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

        // Bootstrap an initial admin account from environment variables
        // when the users table is empty and the provided credentials match.
        if (!user) {
          const userCount = await prisma.user.count();
          const initialEmail = process.env.INITIAL_ADMIN_EMAIL?.trim();
          const initialPassword = process.env.INITIAL_ADMIN_PASSWORD;
          const initialName = process.env.INITIAL_ADMIN_NAME?.trim() || "System Admin";

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
                fullName: initialName,
                hashedPassword: await hashPassword(initialPassword!),
                role: "admin",
              },
            });

            await ensureUserAccount(
              createdAdmin.id,
              createdAdmin.role,
              createdAdmin.fullName
            );

            user = createdAdmin;
          }
        }

        if (!user) return null;

        const isValid = await verifyPassword(
          credentials.password,
          user.hashedPassword
        );
        if (!isValid) return null;

        return {
          id: String(user.id),
          email: user.email,
          name: user.fullName,
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

  pages: {
    signIn: "/login",
  },

  secret: process.env.NEXTAUTH_SECRET,
};
