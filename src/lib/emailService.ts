import nodemailer from "nodemailer";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import fs from "fs";
import path from "path";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { uploadBytesToGoogleDrive, ensureDrivePath } from "./googleDrive";

// Ensure Node has access to the transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.mailtrap.io",
  port: Number(process.env.SMTP_PORT) || 2525,
  auth: {
    user: process.env.SMTP_USER || "user",
    pass: process.env.SMTP_PASS || "password",
  },
});

export async function sendReceiptEmail(paymentId: string, status: "approved" | "rejected"): Promise<{ emailSent: boolean; receiptLink: string }> {
  // Fetch payment & project details
  const payment = await prisma.clientPayment.findUnique({
    where: { id: paymentId },
    include: {
      client: true, // The client who submitted the payment
      project: {
        include: {
          client: true,
          assignments: {
            include: { user: true },
          },
        },
      },
    },
  });

  if (!payment || !payment.project) return { emailSent: false, receiptLink: "" };

  const project = payment.project;

  // Identify all clients on the project
  const clients = new Map<string, any>();
  if (project.client && project.client.email) {
    clients.set(project.client.email, project.client);
  }
  for (const asgn of project.assignments) {
    if ((asgn.user.role as any) === "CLIENT" && asgn.user.email) {
      clients.set(asgn.user.email, asgn.user);
    }
  }

  const clientEmails = Array.from(clients.keys());
  
  // NOTE: We do not return early if no clientEmails exist because we still want to generate and upload the receipt to Google Drive.

  let clientName = "Valued Client";
  if (payment.client && payment.client.name) {
    clientName = payment.client.name;
  } else if (project.client?.name) {
    clientName = project.client.name;
  } else if (project.assignments.length > 0) {
    const clientUser = project.assignments.find((a: any) => a.user.role === "CLIENT");
    if (clientUser?.user?.name) {
      clientName = clientUser.user.name;
    }
  }

  const projNum = String(project.accountId).padStart(3, "0");
  const projLetters = project.name.replace(/[^a-zA-Z]/g, "").substring(0, 3).toUpperCase().padEnd(3, "X");
  const receiptNo = `REC${projNum}${projLetters}-${payment.id.substring(payment.id.length - 4).toUpperCase()}`;
  const receiptDate = new Date().toLocaleDateString("en-US");
  
  // Use raw query to retrieve last invoice number securely without prisma client generation issues
  const projRows: any[] = await prisma.$queryRawUnsafe(`SELECT last_invoice_no FROM "Project" WHERE id = $1`, project.id);
  const linkedInvoiceNo = (projRows.length > 0 && projRows[0].last_invoice_no) 
    ? projRows[0].last_invoice_no 
    : `INV${projNum}${projLetters}-01`;
  
  let emailSent = false;
  let receiptLink = "";

  if (status === "rejected") {
    if (clientEmails.length > 0) {
      try {
        await transporter.sendMail({
          from: '"Accounting Platform" <accounting@example.com>',
          to: clientEmails,
          subject: `Payment Declined - Project: ${project.name}`,
          text: `Hello,\n\nWe regret to inform you that your payment of ${payment.amount} for the project "${project.name}" has been declined.\n\nPlease contact the financial team for more details.\n\nThank you.`,
        });
        emailSent = true;
      } catch (err) {
        console.error("Failed to send rejection email", err);
      }
    }
    return { emailSent, receiptLink };
  }

  const pdfBuffer = await generateReceiptPdf({
    receiptNo,
    receiptDate,
    clientName,
    projectName: project.name,
    linkedInvoiceNo,
    amountReceived: Number(payment.amount).toLocaleString("en-US", { style: "currency", currency: "LKR" }),
    paymentMethod: (payment as any).receiptPath?.includes("bank") ? "Bank Transfer" : "Other",
    referenceId: payment.title || payment.description || payment.id,
    receivedBy: "Aura Digital Labs",
  });

  const filename = `${receiptNo}_${project.name.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;

  if (clientEmails.length > 0) {
    try {
      await transporter.sendMail({
        from: '"Accounting Platform" <accounting@example.com>',
        to: clientEmails,
        subject: `Payment Receipt - Project: ${project.name}`,
        text: `Hello,\n\nThank you for your payment of ${payment.amount}.\nYour payment has been approved and successfully processed.\n\nPlease find your official Payment Receipt attached.\n\nThank you for your business.`,
        attachments: [
          {
            filename,
            content: pdfBuffer,
            contentType: 'application/pdf'
          },
        ],
      });
      emailSent = true;
    } catch (err) {
      console.error("Failed to send receipt email:", err);
    }
  }

  // Upload to Google Drive matching standard format
  try {
    const folderId = await ensureDrivePath([
      "Accounting Platform",
      "Projects",
      project.name,
      "Receipts",
    ]);

    receiptLink = await uploadBytesToGoogleDrive({
      fileBuffer: pdfBuffer,
      originalName: filename,
      mimeType: "application/pdf",
      folderId,
      prefix: `receipt`,
      exactName: true,
    });
  } catch (error) {
    console.error("Failed to upload receipt to Google Drive:", error);
  }

  return { emailSent, receiptLink };
}

async function generateReceiptPdf(data: any): Promise<Buffer> {
  const doc = new jsPDF({ format: "a4", unit: "mm" });

  let logoBase64 = "";
  try {
    const logoPath = path.join(process.cwd(), "public", "aura-logo.png");
    logoBase64 = fs.readFileSync(logoPath).toString("base64");
  } catch (e) {
    console.error("Could not load aura-logo.png", e);
  }

  if (logoBase64) {
    // Header Logo
    doc.addImage(`data:image/png;base64,${logoBase64}`, "PNG", 14, 15, 16, 16);
  }

  // Brand and Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(14, 165, 233); // Light Blue
  doc.text("PAYMENT RECEIPT", logoBase64 ? 34 : 14, 26);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text("Aura Accounting Platform", logoBase64 ? 34 : 14, 32);
  
  // Receipt Information
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(14, 165, 233);
  doc.text("Receipt Information", 14, 48);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.text(`Receipt Number: ${data.receiptNo}`, 14, 54);
  doc.text(`Receipt Date: ${data.receiptDate}`, 14, 60);
  doc.text(`Linked Invoice No: ${data.linkedInvoiceNo}`, 14, 66);

  // Client/Project
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(14, 165, 233);
  doc.text("Client & Project Details", 100, 48);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.text(`Client Name: ${data.clientName}`, 100, 54);
  doc.text(`Project Name: ${data.projectName}`, 100, 60);

  // Payment Details Table
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(14, 165, 233);
  doc.text("Payment Details", 14, 78);

  autoTable(doc, {
    startY: 82,
    head: [["Description", "Details"]],
    body: [
      ["Amount Received", data.amountReceived],
      ["Payment Method", data.paymentMethod],
      ["Transaction / Reference ID", data.referenceId],
      ["Received By", data.receivedBy]
    ],
    theme: "striped",
    headStyles: { fillColor: [14, 165, 233], textColor: 255 }, // Light Blue sky-500
    styles: { fontSize: 10, cellPadding: 5 },
    columnStyles: {
      1: { halign: "right", fontStyle: "bold" },
    },
  });

  const finalYDetails = (doc as any).lastAutoTable.finalY + 10;

  // Professional Notes Section
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(14, 165, 233);
  doc.text("Notes", 14, finalYDetails);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.text("This receipt confirms payment received toward the referenced invoice.", 14, finalYDetails + 8);
  doc.text("Final project cost and outstanding balance may vary based on ongoing work and updated invoices.", 14, finalYDetails + 14);

  const currentY = finalYDetails + 20;

  // Notes/Footer
  const footerY = Math.max(currentY + 20, 240);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(10);
  doc.text("Thank you for your payment!", 14, footerY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text("This is an electronically generated receipt. For any discrepancies, please contact our billing team.", 14, footerY + 6);

  // Add watermark on top of everything to ensure it's not hidden by striped backgrounds
  if (logoBase64) {
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setGState(new (doc as any).GState({ opacity: 0.1 }));
        doc.addImage(`data:image/png;base64,${logoBase64}`, "PNG", 55, 100, 100, 100);
        doc.setGState(new (doc as any).GState({ opacity: 1.0 }));
    }
  }

  // Return buffer
  const arrayBuffer = doc.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}