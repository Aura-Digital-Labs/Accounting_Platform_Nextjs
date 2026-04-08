import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { uploadBytesToGoogleDrive } from "@/lib/googleDrive";
import { Account, EntryType } from "@prisma/client";
import { getServerSession } from "@/lib/auth";
import { logAuditAction, AuditAction } from "@/lib/auditLog";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerSession();
    if (!session || !["admin", "financial_officer"].includes(session.user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const resolvedParams = await params;
    const fdId = parseInt(resolvedParams.id, 10);
    if (isNaN(fdId)) {
      return NextResponse.json({ error: "Invalid FD ID" }, { status: 400 });
    }

    const formData = await request.formData();
    const bankName = formData.get("bankName") as string;
    const accountNumber = formData.get("accountNumber") as string;
    const startingDate = formData.get("startingDate") as string;
    const periodType = formData.get("periodType") as string;
    const periodValue = parseInt(formData.get("periodValue") as string, 10);
    const amount = formData.get("amount") as string;
    const expectedInterest = formData.get("expectedInterest") as string || "0";
    const status = formData.get("status") as string || "ACTIVE";
    const file = formData.get("referenceDocument") as File | null;

    if (
      !bankName ||
      !accountNumber ||
      !startingDate ||
      !periodType ||
      isNaN(periodValue) ||
      !amount
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    let referenceUrl: string | undefined = undefined;

    if (file && file.size > 0) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      referenceUrl = await uploadBytesToGoogleDrive(buffer, file.name, file.type);
    }

    const oldFd = await prisma.fixedDeposit.findUnique({
      where: { id: fdId },
    });

    if (!oldFd) {
      return NextResponse.json({ error: "Fixed Deposit not found" }, { status: 404 });
    }

    const updatedFd = await prisma.fixedDeposit.update({
      where: { id: fdId },
      data: {
        bankName,
        accountNumber,
        startingDate: new Date(startingDate),
        periodType,
        periodValue,
        amount,
        expectedInterest,
        status,
        ...(referenceUrl ? { referenceDocumentUrl: referenceUrl } : {}),
      },
    });

    await logAuditAction({
      userId: session.user.id,
      action: AuditAction.ACCOUNT_UPDATED,
      resourceType: "fixed_deposit",
      resourceId: String(fdId),
      description: `Fixed Deposit updated: ${bankName} account ${accountNumber}`,
      status: "success",
    });

    return NextResponse.json(updatedFd, { status: 200 });
  } catch (error: any) {
    console.error("Error updating fixed deposit:", error);
    return NextResponse.json(
       { error: error.message || "Internal Server Error" },
       { status: 500 }
    );
  }
}
