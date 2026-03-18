import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";
import { createTransaction, AccountingError } from "@/lib/accounting";
import { uploadBytesToGoogleDrive } from "@/lib/googleDrive";
import { Decimal } from "@prisma/client/runtime/library";

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
    const projectId = Number(formData.get("project_id"));
    const description = formData.get("description") as string;
    const amountStr = formData.get("amount") as string;
    const expenseDateStr = formData.get("expense_date") as string;
    const paymentSource = ((formData.get("payment_source") as string) || "personal")
      .trim()
      .toLowerCase();
    const receiptFile = formData.get("receipt_file") as File | null;

    // Validate expense date
    const parsedDate = new Date(expenseDateStr);
    if (isNaN(parsedDate.getTime())) {
      return NextResponse.json({ detail: "Invalid expense date" }, { status: 400 });
    }

    // Validate project
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return NextResponse.json({ detail: "Project not found" }, { status: 404 });
    }

    // Employee must be assigned
    if (currentUser.role === "employee") {
      const assignment = await prisma.projectAssignment.findFirst({
        where: { projectId, employeeId: currentUser.id },
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
        receiptPath = await uploadBytesToGoogleDrive({
          fileBuffer: buffer,
          originalName: receiptFile.name,
          mimeType: receiptFile.type,
          folderId: process.env.GOOGLE_DRIVE_EXPENSES_FOLDER_ID || null,
          prefix: `expense-${currentUser.id}-${projectId}`,
        });
      } catch (err) {
        return NextResponse.json(
          { detail: `Document upload unavailable: ${err instanceof Error ? err.message : err}` },
          { status: 503 }
        );
      }
    }

    const expense = await prisma.expense.create({
      data: {
        employeeId: currentUser.id,
        projectId,
        description,
        amount: new Decimal(normalizedAmount.toFixed(2)),
        expenseDate: parsedDate,
        receiptPath,
        paymentSource,
      },
    });

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

    let expenses;
    if (currentUser.role === "admin") {
      expenses = await prisma.expense.findMany({
        orderBy: { id: "desc" },
      });
    } else {
      expenses = await prisma.expense.findMany({
        where: { employeeId: currentUser.id },
        orderBy: { id: "desc" },
      });
    }

    return NextResponse.json(expenses);
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    return NextResponse.json({ detail: "Failed to list expenses" }, { status: 500 });
  }
}
