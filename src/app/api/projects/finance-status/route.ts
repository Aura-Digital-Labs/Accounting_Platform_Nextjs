import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export async function PUT(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json();

    if (!body || !Array.isArray(body.updates)) {
      return NextResponse.json({ detail: "Invalid request" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      for (const update of body.updates) {
        await tx.$executeRaw(
          Prisma.sql`UPDATE "Project" SET finance_status = ${update.finance_status} WHERE id = ${update.id}`
        );
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ detail: error.message }, { status: 500 });
  }
}
