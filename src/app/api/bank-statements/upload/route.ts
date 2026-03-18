import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireAdmin, AuthError } from "@/lib/auth";
import { uploadBytesToGoogleDrive } from "@/lib/googleDrive";

/**
 * POST /api/bank-statements/upload (authenticated admins/employees, depending on your rules; here we restrict to admins for safety or allow authenticated)
 * We will stick to requireAuth like the original if it was unrestricted, or restrict based on your requirements.
 * Original `routes/bank_statements.py` uses `Depends(get_current_active_user)` for upload.
 */
export async function POST(req: NextRequest) {
  try {
    const currentUser = await requireAuth();

    const formData = await req.formData();
    const accountId = Number(formData.get("account_id"));
    const month = formData.get("month") as string;
    const file = formData.get("file") as File | null;

    if (!accountId || !month) {
      return NextResponse.json({ detail: "Both account_id and month are required" }, { status: 400 });
    }

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ detail: "Invalid month format. Use YYYY-MM" }, { status: 400 });
    }

    if (!file || file.size === 0) {
      return NextResponse.json({ detail: "File is required" }, { status: 400 });
    }

    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) {
      return NextResponse.json({ detail: "Account not found" }, { status: 404 });
    }

    const existing = await prisma.bankStatement.findFirst({
      where: { accountId, month },
    });
    if (existing) {
      return NextResponse.json({ detail: "A statement for this account and month already exists" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let statementLink: string;

    try {
      statementLink = await uploadBytesToGoogleDrive({
        fileBuffer: buffer,
        originalName: file.name,
        mimeType: file.type || "application/pdf",
        folderId: process.env.GOOGLE_DRIVE_BANK_STATEMENTS_FOLDER_ID || null,
        prefix: `bankstmt-${accountId}-${month}`,
      });
    } catch (err) {
      return NextResponse.json(
        { detail: `Upload unavailable: ${err instanceof Error ? err.message : err}` },
        { status: 503 }
      );
    }

    const statement = await prisma.bankStatement.create({
      data: {
        accountId,
        month,
        statementLink,
      },
    });

    return NextResponse.json(statement, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to upload bank statement";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
