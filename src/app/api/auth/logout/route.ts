import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "@/lib/auth";

/**
 * POST /api/auth/logout
 * Marks the current authenticated user as inactive.
 */
export async function POST() {
  try {
    const session = await getServerSession();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ ok: true, updated: false }, { status: 200 });
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true, updated: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update logout status";
    return NextResponse.json({ ok: false, detail: message }, { status: 500 });
  }
}