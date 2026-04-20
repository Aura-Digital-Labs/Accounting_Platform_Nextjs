import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  uploadBytesToGoogleDrive,
  ensureDrivePath,
} from "@/lib/googleDrive";

let needsManualIntegerIdsCache: boolean | null = null;
let hasEntryTypeEnumCache: boolean | null = null;

async function needsManualIntegerIds(): Promise<boolean> {
  if (needsManualIntegerIdsCache !== null) {
    return needsManualIntegerIdsCache;
  }
  const rows = (await prisma.$queryRawUnsafe(`
    SELECT table_name, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND ((table_name = 'transactions' AND column_name = 'id')
        OR (table_name = 'transaction_entries' AND column_name = 'id'))
  `)) as Array<{ table_name: string; column_default: string | null }>;
  const map = new Map(rows.map((r) => [r.table_name, r.column_default]));
  const txHasDefault = Boolean(map.get("transactions"));
  const entryHasDefault = Boolean(map.get("transaction_entries"));
  needsManualIntegerIdsCache = !(txHasDefault && entryHasDefault);
  return needsManualIntegerIdsCache;
}

async function hasEntryTypeEnum(): Promise<boolean> {
  if (hasEntryTypeEnumCache !== null) {
    return hasEntryTypeEnumCache;
  }
  const rows = (await prisma.$queryRawUnsafe(`
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'entrytype'
    LIMIT 1
  `)) as Array<{ "?column?": number }>;
  hasEntryTypeEnumCache = rows.length > 0;
  return hasEntryTypeEnumCache;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession();
      if (!session || !["admin", "financial_officer"].includes(String(session.user.role).toLowerCase())) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
    const fixedDeposits = await prisma.fixedDeposit.findMany({
      where: {
        status: {
          not: "CLOSED"
        }
      },
      include: {
        initialInvestmentAccount: true,
      },
      orderBy: { createdAt: 'desc' }
    });

    const investmentAccounts = await prisma.account.findMany({
      where: {
        isPaymentAccepting: true,
      },
      select: {
        id: true,
        name: true,
      }
    });

    return NextResponse.json({ fixedDeposits, investmentAccounts });
  } catch (error: any) {
    console.error("GET FD Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session || !["admin", "financial_officer"].includes(String(session.user.role).toLowerCase())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    const manualIntegerIds = await needsManualIntegerIds();
    const hasEnumEntryType = await hasEntryTypeEnum();
    
    const formData = await req.formData();
    const bankName = formData.get("bankName") as string;
    const accountNumber = formData.get("accountNumber") as string;
    const initialInvestmentAccountId = formData.get("initialInvestmentAccountId") as string;
    const startingDate = formData.get("startingDate") as string;
    const periodType = formData.get("periodType") as string;
    const periodValue = formData.get("periodValue") as string;
    const amount = formData.get("amount") as string;
    const expectedInterest = formData.get("expectedInterest") as string;
    const file = formData.get("referenceDocument") as File | null;

    if (!bankName || !accountNumber || !initialInvestmentAccountId || !startingDate || !periodType || !periodValue || !amount || !expectedInterest) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    let referenceDocumentUrl: string | null = null;
    if (file && file.size > 0) {
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const folderId = await ensureDrivePath([
          "Accounting Platform",
          "Financial_Records",
          "Fixed_Deposits",
          `FD - ${bankName} - ${accountNumber}`,
        ]);

        referenceDocumentUrl = await uploadBytesToGoogleDrive({
          fileBuffer: buffer,
          originalName: file.name,
          mimeType: file.type,
          folderId,
          prefix: "FixedDeposit",
        });
      } catch (uploadErr) {
        console.error("Google Drive Upload Error:", uploadErr);
        return NextResponse.json({ error: "Failed to upload document to Google Drive" }, { status: 500 });
      }
    }

    const sourceAccount = await prisma.account.findUnique({
      where: { id: parseInt(initialInvestmentAccountId) }
    });

    if (!sourceAccount) {
      return NextResponse.json({ error: "Source account not found" }, { status: 404 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create a new Asset Account specifically for this Fixed Deposit
      const fdAccount = await tx.account.create({
        data: {
          code: `FD-${Date.now()}`,
          name: `FD - ${bankName} - ${accountNumber}`,
          type: "asset",
          isPaymentAccepting: false,
          accountNumber: accountNumber,
          bankName: bankName,
        }
      });

      // 2. Create the Fixed Deposit Record
      const fd = await tx.fixedDeposit.create({
        data: {
          bankName,
          accountNumber,
          startingDate: new Date(startingDate),
          periodType,
          periodValue: parseInt(periodValue),
          amount: parseFloat(amount),
          expectedInterest: parseFloat(expectedInterest),
          referenceDocumentUrl: referenceDocumentUrl || "",
          status: "ACTIVE",
          initialInvestmentAccountId: parseInt(initialInvestmentAccountId),
          fdAccountId: fdAccount.id,
          createdById: session.user.id,
        }
      });

      // 3. Create the Transaction (Debit FD Account, Credit Initial Investment Account)
      let transactionId: number | undefined;
      if (manualIntegerIds) {
        const txMax = await tx.transaction.aggregate({ _max: { id: true } });
        transactionId = (txMax._max.id ?? 0) + 1;
      }

      if (!manualIntegerIds && hasEnumEntryType) {
        await tx.transaction.create({
          data: {
            description: `Fixed Deposit investment: ${bankName} (${accountNumber})`,
            createdBy: session.user.id,
            sourceType: "fixed_deposit",
            sourceId: fd.id.toString(),
            documentLink: referenceDocumentUrl || null,
            entries: {
              create: [
                {
                  accountId: fdAccount.id,
                  entryType: "debit",
                  amount: parseFloat(amount)
                },
                {
                  accountId: parseInt(initialInvestmentAccountId),
                  entryType: "credit",
                  amount: parseFloat(amount)
                }
              ]
            }
          }
        });
      } else {
        const createdTx = await tx.transaction.create({
          data: {
            ...(transactionId ? { id: transactionId } : {}),
            description: `Fixed Deposit investment: ${bankName} (${accountNumber})`,
            createdBy: session.user.id,
            sourceType: "fixed_deposit",
            sourceId: fd.id.toString(),
            documentLink: referenceDocumentUrl || null,
          }
        });

        const entryTxId = transactionId || createdTx.id;

        if (manualIntegerIds) {
          const entryMax = await tx.transactionEntry.aggregate({ _max: { id: true } });
          const firstEntryId = (entryMax._max.id ?? 0) + 1;

          await tx.$executeRawUnsafe(`
            INSERT INTO transaction_entries (id, transaction_id, account_id, entry_type, amount, is_checked)
            VALUES ($1, $2, $3, CAST($4 AS entrytype), $5, $6)
          `, firstEntryId, entryTxId, fdAccount.id, "DEBIT", parseFloat(amount), false);

          await tx.$executeRawUnsafe(`
            INSERT INTO transaction_entries (id, transaction_id, account_id, entry_type, amount, is_checked)
            VALUES ($1, $2, $3, CAST($4 AS entrytype), $5, $6)
          `, firstEntryId + 1, entryTxId, parseInt(initialInvestmentAccountId), "CREDIT", parseFloat(amount), false);
        } else {
          await tx.$executeRawUnsafe(`
            INSERT INTO transaction_entries (transaction_id, account_id, entry_type, amount, is_checked)
            VALUES ($1, $2, CAST($3 AS entrytype), $4, $5)
          `, entryTxId, fdAccount.id, "DEBIT", parseFloat(amount), false);

          await tx.$executeRawUnsafe(`
            INSERT INTO transaction_entries (transaction_id, account_id, entry_type, amount, is_checked)
            VALUES ($1, $2, CAST($3 AS entrytype), $4, $5)
          `, entryTxId, parseInt(initialInvestmentAccountId), "CREDIT", parseFloat(amount), false);
        }
      }

      return fd;
    });

    return NextResponse.json({ message: "Fixed deposit created", fixedDeposit: result });
  } catch (error: any) {
    console.error("POST FD Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
