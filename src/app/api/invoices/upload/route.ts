import { NextRequest, NextResponse } from "next/server";
import { uploadBytesToGoogleDrive, ensureDrivePath } from "@/lib/googleDrive";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const currentUser = await requireAuth();
    const role = String(currentUser.role || "").toLowerCase();
    if (role !== "admin" && role !== "financial_officer") {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 403 });
    }

    const formData = await req.formData();
    const projectId = formData.get("projectId") as string;
    const projectName = formData.get("projectName") as string;
    const invoiceNo = formData.get("invoiceNo") as string;
    const file = formData.get("file") as File | null;

    if (!projectName || !file || file.size === 0) {
      return NextResponse.json({ detail: "Invalid input" }, { status: 400 });
    }

    if (projectId && invoiceNo) {
      // Use raw SQL to bypass Prisma client schema cache issues
      await prisma.$executeRawUnsafe(
        `UPDATE "Project" SET last_invoice_no = $1, invoice_count = COALESCE(invoice_count, 0) + 1 WHERE id = $2`,
        invoiceNo,
        projectId
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const folderId = await ensureDrivePath([
      "Accounting Platform",
      "Projects",
      projectName,
      "Invoices",
    ]);

    const documentLink = await uploadBytesToGoogleDrive({
      fileBuffer: buffer,
      originalName: file.name,
      mimeType: file.type,
      folderId,
      prefix: `invoice`,
      exactName: true,
    });

    return NextResponse.json({ link: documentLink });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to upload invoice";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
