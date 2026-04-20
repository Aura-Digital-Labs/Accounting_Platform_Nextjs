import { NextRequest, NextResponse } from "next/server";
import { uploadBytesToGoogleDrive, ensureDrivePath } from "@/lib/googleDrive";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.mailtrap.io",
  port: Number(process.env.SMTP_PORT) || 2525,
  auth: {
    user: process.env.SMTP_USER || "user",
    pass: process.env.SMTP_PASS || "password",
  },
});

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

    const buffer = Buffer.from(await file.arrayBuffer());

    // Send email to clients
    let emailSent = false;
    let emailsList: string[] = [];

    if (projectId) {
      // Find all clients in this project
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          client: true, // Primary client
          assignments: {
            include: { user: true },
          },
        },
      });

      if (project) {
        const clientEmails = new Set<string>();

        if (project.client?.email) {
          clientEmails.add(project.client.email);
        }

        project.assignments.forEach((asgn) => {
          if ((asgn.user.role as any) === "CLIENT" && asgn.user.email) {
            clientEmails.add(asgn.user.email);
          }
        });

        emailsList = Array.from(clientEmails);

        if (emailsList.length > 0) {
          try {
            await transporter.sendMail({
              from: '"Aura Accounting Platform" <accounting@auralabs.com>',
              to: emailsList,
              subject: `Invoice Available - Project: ${project.name} (${invoiceNo})`,
              text: `Hello,\n\nA new invoice (${invoiceNo}) is available for the project "${project.name}".\n\nPlease find your official invoice attached.\n\nThank you for your business.`,
              attachments: [
                {
                  filename: file.name,
                  content: buffer,
                  contentType: "application/pdf",
                },
              ],
            });
            emailSent = true;
          } catch (err) {
            console.error("Failed to send invoice email:", err);
          }
        }
      }
    }

    // Standard upload flow
    if (projectId && invoiceNo) {
      await prisma.$executeRawUnsafe(
        `UPDATE "Project" SET last_invoice_no = $1, invoice_count = COALESCE(invoice_count, 0) + 1 WHERE id = $2`,
        invoiceNo,
        projectId
      );
    }

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

    return NextResponse.json({ link: documentLink, emailSent });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to email invoice";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
