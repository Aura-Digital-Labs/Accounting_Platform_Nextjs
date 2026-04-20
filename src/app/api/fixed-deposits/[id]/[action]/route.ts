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

export async function POST(req: NextRequest, { params }: { params: Promise<{ action: string, id: string }> | { action: string, id: string } }) {
  try {
    const session = await getServerSession();
    if (!session || !["admin", "financial_officer"].includes(String(session.user.role).toLowerCase())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const resolvedParams = await params;
    const fdId = parseInt(resolvedParams.id);
    const action = resolvedParams.action; // "renew" or "close"

    const fd = await prisma.fixedDeposit.findUnique({
      where: { id: fdId },
      include: {
        fdAccount: true,
        initialInvestmentAccount: true,
      }
    });

    if (!fd) return NextResponse.json({ error: "Fixed deposit not found" }, { status: 404 });
    if (fd.status === "CLOSED" || fd.status === "RENEWED") {
      return NextResponse.json({ error: "Fixed deposit already processed" }, { status: 400 });
    }

    const manualIntegerIds = await needsManualIntegerIds();
    const hasEnumEntryType = await hasEntryTypeEnum();

    const result = await prisma.$transaction(
      async (tx) => {
        // Find or create FD Interest Account (Revenue)
      let interestAccount = await tx.account.findUnique({
        where: { code: 'FD-INTEREST-INCOME' }
      });

      if (!interestAccount) {
        interestAccount = await tx.account.create({
          data: {
            code: 'FD-INTEREST-INCOME',
            name: 'Fixed Deposit Interest Income',
            type: 'revenue',
            isPaymentAccepting: false,
          }
        });
      }

      let referenceDocumentUrl: string | null = null;
      let transactionId: number | undefined;
      let entryTxId: number;

      if (manualIntegerIds) {
        const txMax = await tx.transaction.aggregate({ _max: { id: true } });
        transactionId = (txMax._max.id ?? 0) + 1;
        entryTxId = transactionId;
      }

      if (action === "close") {
        // CLOSE FD
        // Debit the initial bank account (FD amount + Interest)
        // Credit the FD account (FD amount)
        // Credit the Interest account (Interest amount)
        
        const totalAmount = Number(fd.amount) + Number(fd.expectedInterest);

        const creditFd = {
          accountId: fd.fdAccountId,
          entryType: "CREDIT",
          amount: Number(fd.amount)
        };
        const creditInterest = {
          accountId: interestAccount.id,
          entryType: "CREDIT",
          amount: Number(fd.expectedInterest)
        };
        const debitBank = {
          accountId: fd.initialInvestmentAccountId,
          entryType: "DEBIT",
          amount: totalAmount
        };

        if (manualIntegerIds) {
          const entryMax = await tx.transactionEntry.aggregate({ _max: { id: true } });
          const firstEntryId = (entryMax._max.id ?? 0) + 1;
          
          await tx.transaction.create({
            data: {
              id: transactionId,
              description: `Closed Fixed Deposit: ${fd.bankName} (${fd.accountNumber})`,
              createdBy: session.user.id,
              sourceType: "fixed_deposit",
              sourceId: fd.id.toString(),
            }
          });

          await tx.$executeRawUnsafe(`INSERT INTO transaction_entries (id, transaction_id, account_id, entry_type, amount, is_checked) VALUES ($1, $2, $3, CAST($4 AS entrytype), $5, $6)`, firstEntryId, entryTxId!, debitBank.accountId, debitBank.entryType, debitBank.amount, false);
          await tx.$executeRawUnsafe(`INSERT INTO transaction_entries (id, transaction_id, account_id, entry_type, amount, is_checked) VALUES ($1, $2, $3, CAST($4 AS entrytype), $5, $6)`, firstEntryId + 1, entryTxId!, creditFd.accountId, creditFd.entryType, creditFd.amount, false);
          await tx.$executeRawUnsafe(`INSERT INTO transaction_entries (id, transaction_id, account_id, entry_type, amount, is_checked) VALUES ($1, $2, $3, CAST($4 AS entrytype), $5, $6)`, firstEntryId + 2, entryTxId!, creditInterest.accountId, creditInterest.entryType, creditInterest.amount, false);
        } else {
          const createdTx = await tx.transaction.create({
            data: {
              ...(transactionId ? { id: transactionId } : {}),
              description: `Closed Fixed Deposit: ${fd.bankName} (${fd.accountNumber})`,
              createdBy: session.user.id,
              sourceType: "fixed_deposit",
              sourceId: fd.id.toString(),
            }
          });

          const createdTxId = transactionId || createdTx.id;

          await tx.$executeRawUnsafe(`INSERT INTO transaction_entries (transaction_id, account_id, entry_type, amount, is_checked) VALUES ($1, $2, CAST($3 AS entrytype), $4, $5)`, createdTxId, debitBank.accountId, debitBank.entryType, debitBank.amount, false);
          await tx.$executeRawUnsafe(`INSERT INTO transaction_entries (transaction_id, account_id, entry_type, amount, is_checked) VALUES ($1, $2, CAST($3 AS entrytype), $4, $5)`, createdTxId, creditFd.accountId, creditFd.entryType, creditFd.amount, false);
          await tx.$executeRawUnsafe(`INSERT INTO transaction_entries (transaction_id, account_id, entry_type, amount, is_checked) VALUES ($1, $2, CAST($3 AS entrytype), $4, $5)`, createdTxId, creditInterest.accountId, creditInterest.entryType, creditInterest.amount, false);
        }

        await tx.account.update({
          where: { id: fd.fdAccountId },
          data: {
            isClosed: true,
            closedAt: new Date(),
          }
        });

        return await tx.fixedDeposit.update({
          where: { id: fd.id },
          data: { status: "CLOSED" }
        });
      }

      if (action === "renew") {
        // RENEW FD
        // Read form data for new doc
        const formData = await req.formData();
        const file = formData.get("referenceDocument") as File | null;
        
        const newPeriodType = formData.get("periodType") as string || fd.periodType;
        const newPeriodValue = formData.get("periodValue") ? parseInt(formData.get("periodValue") as string) : fd.periodValue;
        const newExpectedInterest = formData.get("expectedInterest") ? parseFloat(formData.get("expectedInterest") as string) : null;
        
        if (file && file.size > 0) {
          const buffer = Buffer.from(await file.arrayBuffer());
          const folderId = await ensureDrivePath([
            "Accounting Platform",
            "Financial_Records",
            "Fixed_Deposits",
            `FD - ${fd.bankName} - ${fd.accountNumber}`,
          ]);

          referenceDocumentUrl = await uploadBytesToGoogleDrive({
            fileBuffer: buffer,
            originalName: file.name,
            mimeType: file.type,
            folderId,
            prefix: "FixedDepositRenew",
          });
        }

        // Debit FD Account (Asset) by Interest (increases asset because interest is reinvested)
        // Credit Interest Account (Revenue) by Interest
        const debitFd = {
          accountId: fd.fdAccountId,
          entryType: "DEBIT",
          amount: Number(fd.amount)
        };
        const creditInterest = {
          accountId: interestAccount.id,
          entryType: "CREDIT",
          amount: Number(fd.expectedInterest)
        };

        if (manualIntegerIds) {
          const entryMax = await tx.transactionEntry.aggregate({ _max: { id: true } });
          const firstEntryId = (entryMax._max.id ?? 0) + 1;

          await tx.transaction.create({
            data: {
              id: transactionId,
              description: `Renewed Fixed Deposit: ${fd.bankName} (${fd.accountNumber})`,
              createdBy: session.user.id,
              sourceType: "fixed_deposit",
              sourceId: fd.id.toString(),
              documentLink: referenceDocumentUrl || null,
            }
          });

          await tx.$executeRawUnsafe(`INSERT INTO transaction_entries (id, transaction_id, account_id, entry_type, amount, is_checked) VALUES ($1, $2, $3, CAST($4 AS entrytype), $5, $6)`, firstEntryId, entryTxId!, debitFd.accountId, debitFd.entryType, debitFd.amount, false);
          await tx.$executeRawUnsafe(`INSERT INTO transaction_entries (id, transaction_id, account_id, entry_type, amount, is_checked) VALUES ($1, $2, $3, CAST($4 AS entrytype), $5, $6)`, firstEntryId + 1, entryTxId!, creditInterest.accountId, creditInterest.entryType, creditInterest.amount, false);
        } else {
          const createdTx = await tx.transaction.create({
            data: {
              ...(transactionId ? { id: transactionId } : {}),
              description: `Renewed Fixed Deposit: ${fd.bankName} (${fd.accountNumber})`,
              createdBy: session.user.id,
              sourceType: "fixed_deposit",
              sourceId: fd.id.toString(),
              documentLink: referenceDocumentUrl || null,
            }
          });

          await tx.$executeRawUnsafe(`INSERT INTO transaction_entries (transaction_id, account_id, entry_type, amount, is_checked) VALUES ($1, $2, CAST($3 AS entrytype), $4, $5)`, createdTx.id, debitFd.accountId, debitFd.entryType, debitFd.amount, false);
          await tx.$executeRawUnsafe(`INSERT INTO transaction_entries (transaction_id, account_id, entry_type, amount, is_checked) VALUES ($1, $2, CAST($3 AS entrytype), $4, $5)`, createdTx.id, creditInterest.accountId, creditInterest.entryType, creditInterest.amount, false);
        }

        // calculate new start date (day after original expr data)
        const oldStart = new Date(fd.startingDate);
        let newStart = new Date(oldStart.getTime());
        if (fd.periodType === "months") newStart.setMonth(newStart.getMonth() + fd.periodValue);
        else newStart.setDate(newStart.getDate() + fd.periodValue);
        newStart.setDate(newStart.getDate() + 1); // Day after expiry

        const newAmount = Number(fd.amount) + Number(fd.expectedInterest);

        const updateData: any = {
            status: "ACTIVE", // technically active again
            amount: newAmount,
            startingDate: newStart,
            periodType: newPeriodType,
            periodValue: newPeriodValue,
            referenceDocumentUrl: referenceDocumentUrl || fd.referenceDocumentUrl
        };
        
        if (newExpectedInterest !== null) {
            updateData.expectedInterest = newExpectedInterest;
        }

        return await tx.fixedDeposit.update({
          where: { id: fd.id },
          data: updateData
        });
      }

    }, { timeout: 30000, maxWait: 10000 });

    return NextResponse.json({ message: `Fixed deposit ${action} successful`, result });
  } catch (error: any) {
    console.error(`POST FD API err:`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
