import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function testpdf() {
  const doc = new jsPDF();
  doc.text("Hello", 10, 10);
  autoTable(doc, { head: [["A", "B"]], body: [["1", "2"]] });
  doc.save("test.pdf");
  console.log("PDF Created in Node");
}

testpdf();