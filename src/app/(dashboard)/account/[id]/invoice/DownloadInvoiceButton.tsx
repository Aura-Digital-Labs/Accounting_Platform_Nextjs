"use client";

import styles from "./page.module.css";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type InvoiceRow = {
  date: string;
  description: string;
  payment: string;
  finalExpense: string;
};

export default function DownloadInvoiceButton({
  disabled,
  invoiceData,
}: {
  disabled: boolean;
  invoiceData: {
    projectName: string;
    generatedDate: string;
    totalBudget: string;
    remainingBalance: string;
    rows: InvoiceRow[];
  };
}) {
  const handleDownload = () => {
    const doc = new jsPDF({ format: "a4", unit: "mm" });

    // Title / Header
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("INVOICE", 14, 20);

    // Project Info
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Project Name: ${invoiceData.projectName}`, 14, 30);
    doc.text(`Date Generated: ${invoiceData.generatedDate}`, 14, 36);
    doc.text(`Total Budget: ${invoiceData.totalBudget}`, 14, 42);

    // Table
    const tableData = invoiceData.rows.map((row) => [
      row.date,
      row.description,
      row.payment,
      row.finalExpense,
    ]);

    autoTable(doc, {
      startY: 50,
      head: [["Date", "Description", "Payment", "Final Expenses"]],
      body: tableData,
      theme: "striped",
      headStyles: { fillColor: [37, 99, 235], textColor: 255 }, // matches the app's brand blue
      styles: { fontSize: 10, cellPadding: 4 },
      columnStyles: {
        0: { cellWidth: 35 },
        2: { halign: "right" },
        3: { halign: "right" },
      },
    });

    // Summary / Balance
    const finalY = (doc as any).lastAutoTable.finalY || 50;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text(`Remaining Balance: ${invoiceData.remainingBalance}`, 14, finalY + 12);

    // Footer
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150);
    doc.text("Thank you for your business.", 14, finalY + 30);

    // Trigger Download
    doc.save(`Invoice_${invoiceData.projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`);
  };

  return (
    <button
      className={styles.linkButton}
      disabled={disabled}
      onClick={handleDownload}
      title={disabled ? "Cannot download: Project finance status is Outdated" : "Download as PDF"}
    >
      Download Invoice (PDF)
    </button>
  );
}
