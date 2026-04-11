import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, AuthError } from "@/lib/auth";
import {
  createTransaction,
  AccountingError,
} from "@/lib/accounting";
import {
  uploadBytesToGoogleDrive,
  ensureDrivePath,
} from "@/lib/googleDrive";

/**
 * GET /api/transactions — List transactions (admin only)
 */
export async function GET() {
  try {
    await requireAdmin();

    try {
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
    } catch {
      const txRows = (await prisma.$queryRawUnsafe(`
        SELECT id, description, posted_at
        FROM transactions
        ORDER BY posted_at DESC
        LIMIT 500
      `)) as Array<{ id: number; description: string; posted_at: Date | string }>;

      if (txRows.length === 0) {
        return NextResponse.json([]);
      }

      const ids = txRows.map((row) => row.id).join(",");
      const entryRows = (await prisma.$queryRawUnsafe(`
        SELECT transaction_id, account_id, entry_type::text AS entry_type, amount
        FROM transaction_entries
        WHERE transaction_id IN (${ids})
        ORDER BY id ASC
      `)) as Array<{
        transaction_id: number;
        account_id: number;
        entry_type: string;
        amount: number | string;
      }>;

      const byTx = new Map<number, Array<{ account_id: number; entry_type: string; amount: number }>>();
      for (const row of entryRows) {
        const normalized = String(row.entry_type || "").toLowerCase();
        const list = byTx.get(row.transaction_id) || [];
        list.push({
          account_id: row.account_id,
          entry_type: normalized === "credit" ? "credit" : "debit",
          amount: Number(row.amount),
        });
        byTx.set(row.transaction_id, list);
      }

      return NextResponse.json(
        txRows.map((tx) => ({
          id: tx.id,
          description: tx.description,
          posted_at: tx.posted_at,
          entries: byTx.get(tx.id) || [],
        }))
      );
    }
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
    let uploadWarning: string | null = null;

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
          const folderId = await ensureDrivePath([
            "Accounting Platform",
            "Other",
          ]);

          documentLink = await uploadBytesToGoogleDrive({
            fileBuffer: buffer,
            originalName: file.name,
            mimeType: file.type,
            folderId,
            prefix: `transaction-${user.id}`,
          });
        } catch (err) {
          // Do not block accounting entries when attachment upload is unavailable.
          uploadWarning = `Document upload unavailable: ${err instanceof Error ? err.message : err}`;
          documentLink = null;
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

    const { logAuditAction, AuditAction } = await import("@/lib/auditLog");
    await logAuditAction({
      userId: user.id,
      action: AuditAction.TRANSACTION_CREATED,
      resourceType: "Transaction",
      resourceId: transaction.id.toString(),
      description: `Manual transaction created: ${description} for amount ${amount}`,
      status: "success",
    });

    return NextResponse.json(
      uploadWarning ? { ...transaction, upload_warning: uploadWarning } : transaction,
      { status: 201 }
    );
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
