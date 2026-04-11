import { syncProjectFinanceStatus } from "@/lib/projectFinance";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";
import {
  uploadBytesToGoogleDrive,
  ensureDrivePath,
} from "@/lib/googleDrive";
import { Decimal } from "@prisma/client/runtime/library";
import {
  createExpenseRaw,
  hasExpenseStatusEnum,
  listExpensesRaw,
  listExpensesRawByEmployee,
} from "@/lib/expenseStorage";

const SUBMISSION_GROUP_PREFIX = "__submission_group__:";

/**
 * POST /api/expenses — Submit expense (employee or PM)
 * GET  /api/expenses — List expenses (admin: all, employee: own)
 */
export async function POST(req: NextRequest) {
  try {
    const currentUser = await requireAuth();

    if (currentUser.role !== "employee" && currentUser.role !== "project_manager") {
      return NextResponse.json(
        { detail: "Only employees and project managers can submit expenses" },
        { status: 403 }
      );
    }

    const formData = await req.formData();
    const projectId = String(formData.get("project_id") || "").trim();
    const description = formData.get("description") as string;
    const amountStr = formData.get("amount") as string;
    const expenseDateStr = formData.get("expense_date") as string;
    const paymentSource = ((formData.get("payment_source") as string) || "personal")
      .trim()
      .toLowerCase();
    const submissionGroupIdRaw = String(formData.get("submission_group_id") || "").trim();
    const submissionGroupId = /^[a-zA-Z0-9_-]{6,128}$/.test(submissionGroupIdRaw)
      ? submissionGroupIdRaw
      : "";
    const submissionGroupMarker = submissionGroupId
      ? `${SUBMISSION_GROUP_PREFIX}${submissionGroupId}`
      : null;
    const receiptFile = formData.get("receipt_file") as File | null;

    // Validate expense date
    const parsedDate = new Date(expenseDateStr);
    if (isNaN(parsedDate.getTime())) {
      return NextResponse.json({ detail: "Invalid expense date" }, { status: 400 });
    }

    // Validate project
    if (!projectId) {
      return NextResponse.json({ detail: "Project is required" }, { status: 400 });
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return NextResponse.json({ detail: "Project not found" }, { status: 404 });
    }

    // Employee must be assigned
    if (currentUser.role === "employee") {
      const assignment = await prisma.projectAssignment.findFirst({
        where: { projectId, userId: currentUser.id },
      });
      if (!assignment) {
        return NextResponse.json(
          { detail: "You are not assigned to this project" },
          { status: 403 }
        );
      }
    }

    // Validate payment source
    if (!["personal", "petty_cash"].includes(paymentSource)) {
      return NextResponse.json(
        { detail: "payment_source must be either personal or petty_cash" },
        { status: 400 }
      );
    }

    if (currentUser.role === "employee" && paymentSource !== "personal") {
      return NextResponse.json(
        { detail: "Employees can submit expenses only with personal payment source" },
        { status: 400 }
      );
    }

    if (currentUser.role === "project_manager" && paymentSource === "petty_cash") {
      if (!currentUser.pettyCashAccountId) {
        return NextResponse.json(
          { detail: "No petty cash account assigned to this project manager" },
          { status: 400 }
        );
      }
      const pettyCashAccount = await prisma.account.findUnique({
        where: { id: currentUser.pettyCashAccountId },
      });
      if (!pettyCashAccount) {
        return NextResponse.json(
          { detail: "Petty cash account not found" },
          { status: 404 }
        );
      }
    }

    // Validate amount
    let normalizedAmount: number;
    try {
      normalizedAmount = Number(Number(amountStr).toFixed(2));
    } catch {
      return NextResponse.json({ detail: "Invalid amount" }, { status: 400 });
    }
    if (normalizedAmount <= 0) {
      return NextResponse.json(
        { detail: "Amount must be greater than zero" },
        { status: 400 }
      );
    }

    // Upload receipt if provided
    let receiptPath: string | null = null;
    if (receiptFile && receiptFile.size > 0) {
      const buffer = Buffer.from(await receiptFile.arrayBuffer());
      try {
        const folderId = await ensureDrivePath([
          "Accounting Platform",
          "Projects",
          project.name,
          "Expenses",
        ]);

        receiptPath = await uploadBytesToGoogleDrive({
          fileBuffer: buffer,
          originalName: receiptFile.name,
          mimeType: receiptFile.type,
          folderId,
          prefix: `expense-${currentUser.id}-${projectId}`,
        });
      } catch (err) {
        return NextResponse.json(
          { detail: `Document upload unavailable: ${err instanceof Error ? err.message : err}` },
          { status: 503 }
        );
      }
    }

    const hasEnumExpenseStatus = await hasExpenseStatusEnum();

    let expense;
    if (hasEnumExpenseStatus) {
      expense = await prisma.expense.create({
        data: {
          employeeId: currentUser.id,
          projectId,
          description,
          amount: new Decimal(normalizedAmount.toFixed(2)),
          expenseDate: parsedDate,
          receiptPath,
          paymentSource,
          pmApprovalNotes: submissionGroupMarker,
        },
      });
    } else {
      const id = randomUUID().replace(/-/g, "");
      const amount = new Decimal(normalizedAmount.toFixed(2));

      expense =
        (await createExpenseRaw({
          id,
          projectId,
          employeeId: currentUser.id,
          description,
          amount,
          expenseDate: parsedDate,
          receiptPath,
          paymentSource,
          status: "pending",
          pmApprovalNotes: submissionGroupMarker,
        })) || {
        id,
        projectId,
        employeeId: currentUser.id,
        description,
        amount: Number(amount),
        expenseDate: parsedDate,
        receiptPath,
        paymentSource,
        status: "pending",
      };
    }

    // Audit log
    const { logAuditAction, AuditAction } = await import("@/lib/auditLog");
    await logAuditAction({
      userId: currentUser.id,
      action: AuditAction.EXPENSE_SUBMITTED,
      resourceType: "Expense",
      resourceId: String(expense.id),
      description: `Expense submitted for project ${projectId} amount ${normalizedAmount.toFixed(2)}`,
      status: "success",
    });

        await syncProjectFinanceStatus(expense.projectId);
return NextResponse.json(expense, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to submit expense";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const currentUser = await requireAuth();
    const isAdminLike =
      currentUser.role === "admin" || currentUser.role === "financial_officer";

    const hasEnumExpenseStatus = await hasExpenseStatusEnum();

    const expenses = hasEnumExpenseStatus
      ? isAdminLike
        ? await prisma.expense.findMany({ orderBy: { id: "desc" } })
        : await prisma.expense.findMany({
            where: { employeeId: currentUser.id },
            orderBy: { id: "desc" },
          })
      : isAdminLike
        ? await listExpensesRaw()
        : await listExpensesRawByEmployee(currentUser.id);

    return NextResponse.json(expenses);
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    return NextResponse.json({ detail: "Failed to list expenses" }, { status: 500 });
  }
}
