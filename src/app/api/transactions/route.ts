import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, AuthError } from "@/lib/auth";
import {
  createTransaction,
  AccountingError,
} from "@/lib/accounting";
import { uploadBytesToGoogleDrive } from "@/lib/googleDrive";

/**
 * GET /api/transactions — List transactions (admin only)
 */
export async function GET() {
  try {
    await requireAdmin();

    const transactions = await prisma.transaction.findMany({
      orderBy: { postedAt: "desc" },
      include: {
        entries: {
          select: {
            accountId: true,
            entryType: true,
            amount: true,
          },
        },
      },
      take: 500,
    });

    return NextResponse.json(
      transactions.map((tx) => ({
        id: tx.id,
        description: tx.description,
        posted_at: tx.postedAt,
        entries: tx.entries.map((entry) => ({
          account_id: entry.accountId,
          entry_type: entry.entryType,
          amount: Number(entry.amount),
        })),
      }))
    );
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to list transactions";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

/**
 * POST /api/transactions — Create manual transaction (admin only)
 * Supports multipart form data with optional file upload.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAdmin();

    const contentType = req.headers.get("content-type") || "";
    let description: string;
    let debitAccountId: number;
    let creditAccountId: number;
    let amount: number;
    let reference: string | null = null;
    let documentLink: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      description = formData.get("description") as string;
      debitAccountId = Number(formData.get("debit_account_id"));
      creditAccountId = Number(formData.get("credit_account_id"));
      amount = Number(formData.get("amount"));
      reference = (formData.get("reference") as string) || null;

      const file = formData.get("transaction_file") as File | null;
      if (file && file.size > 0) {
        const buffer = Buffer.from(await file.arrayBuffer());
        try {
          documentLink = await uploadBytesToGoogleDrive({
            fileBuffer: buffer,
            originalName: file.name,
            mimeType: file.type,
            folderId: process.env.GOOGLE_DRIVE_EXPENSES_FOLDER_ID || null,
            prefix: `transaction-${user.id}`,
          });
        } catch (err) {
          return NextResponse.json(
            { detail: `Document upload unavailable: ${err instanceof Error ? err.message : err}` },
            { status: 503 }
          );
        }
      }
    } else {
      const body = await req.json();
      description = body.description;
      debitAccountId = body.debit_account_id || body.debitAccountId;
      creditAccountId = body.credit_account_id || body.creditAccountId;
      amount = body.amount;
      reference = body.reference || null;
      documentLink = body.document_link || body.documentLink || null;
    }

    const transaction = await createTransaction(
      {
        reference,
        description,
        sourceType: "manual",
        documentLink,
        entries: [
          { accountId: debitAccountId, entryType: "debit", amount },
          { accountId: creditAccountId, entryType: "credit", amount },
        ],
      },
      user.id
    );

    return NextResponse.json(transaction, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    if (error instanceof AccountingError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to create transaction";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
