"use client";

import styles from "./page.module.css";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useState } from "react";

export default function DownloadInvoiceButton({
  disabled,
  invoiceData,
}: {
  disabled: boolean;
  invoiceData: {
    projectId: string;
    invoiceNo: string;
    projectNameWithCode: string;
    projectName: string;
    generatedDate: string;
    initialBudget: string;
    totals: {
      subtotal: string;
      tax: string;
      grandTotal: string;
      totalPaymentDone: string;
      remainingPaymentDue: string;
    };
    expenses: { description: string; qty: string; unitPrice: string; totalAmount: string; }[];
    payments: { paymentDate: string; amountPaid: string; paymentMethod: string; reference: string; notes: string; }[];
  };
}) {
  const [isUploading, setIsUploading] = useState(false);

  const handleDownload = async (action: 'download' | 'email' = 'download') => {
    setIsUploading(true);
    const doc = new jsPDF({ format: "a4", unit: "mm" });

    // Load png logo
    let logoBase64 = "";
    try {
      const response = await fetch("/aura-logo.png");
      const blob = await response.blob();
      const reader = new FileReader();
      logoBase64 = await new Promise((resolve) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
      // Extract just the b64 part if it has a prefix
      if (logoBase64.startsWith("data")) {
        logoBase64 = logoBase64.split(",")[1];
      }
    } catch(e) {
      console.error("Failed to load watermark", e);
    }

    if (logoBase64) {
      // Add logo on top left
      doc.addImage(`data:image/png;base64,${logoBase64}`, "PNG", 14, 15, 16, 16);
    }

    // Brand and Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(26);
    doc.setTextColor(14, 165, 233);
    doc.text("INVOICE", logoBase64 ? 34 : 14, 25);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text("Aura Accounting Platform", logoBase64 ? 34 : 14, 31);
    
    // Project and Invoice Info
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(14, 165, 233);
    doc.text("Project & Billing Details", 14, 45);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text(`Invoice No: ${invoiceData.invoiceNo}`, 14, 51);
    doc.text(`Project Name: ${invoiceData.projectNameWithCode}`, 14, 57);
    doc.text(`Invoice Date: ${invoiceData.generatedDate}`, 14, 63);

    // Main Expenses Table
    const expenseTableData = invoiceData.expenses.map((row) => [
      row.description,
      row.qty,
      row.unitPrice,
      row.totalAmount,
    ]);

    autoTable(doc, {
      startY: 73,
      head: [["Description", "Quantity / Unit", "Unit Price", "Total Amount"]],
      body: expenseTableData,
      theme: "striped",
      headStyles: { fillColor: [14, 165, 233], textColor: 255 }, // Light Blue
      styles: { fontSize: 10, cellPadding: 5 },
      columnStyles: {
        0: { cellWidth: 80 },
        3: { halign: "right", fontStyle: "bold" },
      },
    });

    // Summary Section
    const finalYExpenses = (doc as any).lastAutoTable.finalY || 64;
    const summaryX = 130;
    let currentY = finalYExpenses + 10;

    doc.setFontSize(10);
    doc.text(`Subtotal:`, summaryX, currentY);
    doc.text(invoiceData.totals.subtotal, 196, currentY, { align: "right" });
    
    // Omit tax if 0, or just show it
    currentY += 6;
    doc.text(`Tax / Additional:`, summaryX, currentY);
    doc.text(invoiceData.totals.tax, 196, currentY, { align: "right" });

    currentY += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(14, 165, 233); // Light Blue for Grand Total Label
    doc.text(`Grand Total:`, summaryX, currentY);
    doc.text(invoiceData.totals.grandTotal, 196, currentY, { align: "right" });
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(0);
    currentY += 6;
    doc.text(`Total Payment Done:`, summaryX, currentY);
    doc.text(invoiceData.totals.totalPaymentDone, 196, currentY, { align: "right" });

    currentY += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    // Use an accent color for Remaining Due (light blue)
    doc.setTextColor(14, 165, 233);
    doc.text(`Remaining Due:`, summaryX, currentY);
    doc.text(invoiceData.totals.remainingPaymentDue, 196, currentY, { align: "right" });
    doc.setTextColor(0);

    let paymentHistoryStartY = currentY + 20;

    // Optional Check: Will table break page?
    if (paymentHistoryStartY > 240) {
      doc.addPage();
      paymentHistoryStartY = 20;
    }

    // Payment History Table
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(14, 165, 233);
    doc.text("Payment History", 14, paymentHistoryStartY);
    doc.setTextColor(0);

    const paymentTableData = invoiceData.payments.map((row) => [
      row.paymentDate,
      row.amountPaid,
      row.paymentMethod,
      row.reference,
      row.notes,
    ]);

    if (paymentTableData.length === 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.text("No payments recorded yet.", 14, paymentHistoryStartY + 8);
    } else {
      autoTable(doc, {
        startY: paymentHistoryStartY + 6,
        head: [["Date", "Amount Paid", "Payment Method", "Reference", "Notes"]],
        body: paymentTableData,
        theme: "grid",
        headStyles: { fillColor: [14, 165, 233], textColor: 255 }, // Light Blue
        styles: { fontSize: 9, cellPadding: 4 },
        columnStyles: {
          1: { fontStyle: "bold" },
        },
      });
    }

    const finalYPayments = (doc as any).lastAutoTable?.finalY || paymentHistoryStartY + 10;

    // Footer
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(14, 165, 233); // Light Blue Footer
    doc.text("Thank you for your business. For any inquiries, contact our project billing team.", 14, Math.max(finalYPayments + 20, 280));

    // Global Watermark (draw after tables so cell backgrounds don't cover it)
    if (logoBase64) {
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setGState(new (doc as any).GState({ opacity: 0.1 }));
        doc.addImage(`data:image/png;base64,${logoBase64}`, "PNG", 55, 100, 100, 100);
        doc.setGState(new (doc as any).GState({ opacity: 1.0 }));
      }
    }

    // Get the PDF as a Blob
    const pdfBlob = doc.output("blob");

    // Default: Trigger Download locally
    const fileName = `${invoiceData.invoiceNo}.pdf`;
    if (action === 'download') {
      doc.save(fileName);
    }

    // Upload to Google Drive via our API, or Email via our new API
    try {
      const formData = new FormData();
      formData.append("projectId", invoiceData.projectId);
      formData.append("projectName", invoiceData.projectName);
      formData.append("invoiceNo", invoiceData.invoiceNo);
      formData.append("file", new File([pdfBlob], fileName, { type: "application/pdf" }));

      const endpoint = action === 'email' ? "/api/invoices/send-email" : "/api/invoices/upload";
      
      const res = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        console.error(`Failed to ${action === 'email' ? 'email' : 'upload'} invoice`);
      } else {
        if (action === 'email') {
          alert('Invoice has been emailed to all clients and saved in Google Drive.');
        }
        // Refresh page to get the updated invoice sequence
        window.location.reload();
      }
    } catch (err) {
      console.error(`Error with ${action} action:`, err);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
      <button
        className={styles.linkButton}
        disabled={disabled || isUploading}
        onClick={() => handleDownload('download')}
        title={disabled ? "Cannot download: Project finance status is Outdated" : "Download as PDF"}
      >
        {isUploading ? "Processing..." : "Download Invoice"}
      </button>

      <button
        className={styles.linkButton}
        disabled={disabled || isUploading}
        onClick={() => handleDownload('email')}
        title={disabled ? "Cannot email: Project finance status is Outdated" : "Email & Save to Drive"}
        style={{ backgroundColor: '#0EA5E9', color: 'white', border: 'none' }}
      >
        {isUploading ? "Processing..." : "Email Invoice to Clients"}
      </button>
    </div>
  );
}
