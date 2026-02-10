import PDFDocument from "pdfkit";
import type { Order, Company, Contact, OrderLine } from "@shared/schema";

interface OrderPdfData {
  order: Order;
  company: Company | null;
  contact: Contact | null;
  lines: (OrderLine & { productName?: string; productSku?: string })[];
}

export function generateOrderPdf(data: OrderPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width - 100;

    doc.fontSize(20).font("Helvetica-Bold").text("PURAX FEATHER HOLDINGS PTY LTD", { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(10).font("Helvetica").fillColor("#666666").text("Order Document", { align: "center" });
    doc.moveDown(1);

    doc.moveTo(50, doc.y).lineTo(50 + pageWidth, doc.y).strokeColor("#cccccc").stroke();
    doc.moveDown(0.5);

    doc.fillColor("#000000");
    doc.fontSize(16).font("Helvetica-Bold").text(`Order: ${data.order.orderNumber}`);
    doc.moveDown(0.5);

    const detailStartY = doc.y;
    const colWidth = pageWidth / 2;

    doc.fontSize(9).font("Helvetica-Bold").fillColor("#666666").text("ORDER DATE", 50, detailStartY);
    doc.fontSize(10).font("Helvetica").fillColor("#000000")
      .text(formatDate(data.order.orderDate), 50, detailStartY + 14);

    doc.fontSize(9).font("Helvetica-Bold").fillColor("#666666").text("STATUS", 50 + colWidth, detailStartY);
    doc.fontSize(10).font("Helvetica").fillColor("#000000")
      .text(data.order.status.toUpperCase().replace(/_/g, " "), 50 + colWidth, detailStartY + 14);

    doc.y = detailStartY + 35;

    if (data.order.requestedShipDate) {
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#666666").text("REQUESTED SHIP DATE", 50, doc.y);
      doc.fontSize(10).font("Helvetica").fillColor("#000000")
        .text(formatDate(data.order.requestedShipDate), 50, doc.y + 14);
      doc.y += 35;
    }

    if (data.order.shippingMethod) {
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#666666").text("SHIPPING METHOD", 50, doc.y);
      doc.fontSize(10).font("Helvetica").fillColor("#000000")
        .text(data.order.shippingMethod, 50, doc.y + 14);
      doc.y += 35;
    }

    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(50 + pageWidth, doc.y).strokeColor("#cccccc").stroke();
    doc.moveDown(0.5);

    if (data.company) {
      doc.fontSize(12).font("Helvetica-Bold").fillColor("#000000").text("Customer");
      doc.moveDown(0.3);

      const companyName = data.company.tradingName || data.company.legalName;
      doc.fontSize(10).font("Helvetica-Bold").text(companyName.toUpperCase());

      if (data.company.tradingName && data.company.legalName !== data.company.tradingName) {
        doc.fontSize(9).font("Helvetica").fillColor("#666666").text(`Legal: ${data.company.legalName}`);
      }
      if (data.company.abn) {
        doc.fontSize(9).font("Helvetica").fillColor("#666666").text(`ABN: ${data.company.abn}`);
      }

      doc.fillColor("#000000");

      if (data.order.customerName) {
        doc.moveDown(0.2);
        doc.fontSize(9).font("Helvetica-Bold").fillColor("#666666").text("CUSTOMER NAME");
        doc.fontSize(10).font("Helvetica").fillColor("#000000").text(data.order.customerName);
      }

      if (data.company.billingAddress || data.company.shippingAddress) {
        doc.moveDown(0.3);
        const addrY = doc.y;

        if (data.company.billingAddress) {
          doc.fontSize(9).font("Helvetica-Bold").fillColor("#666666").text("BILLING ADDRESS", 50, addrY);
          doc.fontSize(9).font("Helvetica").fillColor("#000000")
            .text(data.company.billingAddress, 50, addrY + 14, { width: colWidth - 20 });
        }

        if (data.company.shippingAddress) {
          doc.fontSize(9).font("Helvetica-Bold").fillColor("#666666").text("SHIPPING ADDRESS", 50 + colWidth, addrY);
          doc.fontSize(9).font("Helvetica").fillColor("#000000")
            .text(data.company.shippingAddress, 50 + colWidth, addrY + 14, { width: colWidth - 20 });
        }

        doc.y = Math.max(doc.y, addrY + 50);
      }

      if (data.company.paymentTerms) {
        doc.moveDown(0.3);
        doc.fontSize(9).font("Helvetica-Bold").fillColor("#666666").text("PAYMENT TERMS");
        doc.fontSize(9).font("Helvetica").fillColor("#000000").text(data.company.paymentTerms);
      }

      doc.moveDown(0.5);
    }

    if (data.contact) {
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#666666").text("CONTACT");
      const contactName = `${data.contact.firstName} ${data.contact.lastName}`;
      doc.fontSize(10).font("Helvetica").fillColor("#000000").text(contactName);
      if (data.contact.email) {
        doc.fontSize(9).font("Helvetica").fillColor("#666666").text(data.contact.email);
      }
      if (data.contact.phone) {
        doc.fontSize(9).font("Helvetica").fillColor("#666666").text(data.contact.phone);
      }
      doc.fillColor("#000000");
      doc.moveDown(0.5);
    }

    doc.moveTo(50, doc.y).lineTo(50 + pageWidth, doc.y).strokeColor("#cccccc").stroke();
    doc.moveDown(0.5);

    doc.fontSize(12).font("Helvetica-Bold").fillColor("#000000").text("Order Items");
    doc.moveDown(0.5);

    const tableLeft = 50;
    const colItem = 220;
    const colSku = 80;
    const colQty = 50;
    const colPrice = 75;
    const colTotal = pageWidth - colItem - colSku - colQty - colPrice;

    let tableY = doc.y;
    doc.rect(tableLeft, tableY, pageWidth, 20).fill("#f0f0f0");
    doc.fillColor("#333333").fontSize(8).font("Helvetica-Bold");
    doc.text("ITEM", tableLeft + 5, tableY + 6, { width: colItem - 10 });
    doc.text("SKU", tableLeft + colItem + 5, tableY + 6, { width: colSku - 10 });
    doc.text("QTY", tableLeft + colItem + colSku + 5, tableY + 6, { width: colQty - 10, align: "center" });
    doc.text("UNIT PRICE", tableLeft + colItem + colSku + colQty + 5, tableY + 6, { width: colPrice - 10, align: "right" });
    doc.text("TOTAL", tableLeft + colItem + colSku + colQty + colPrice + 5, tableY + 6, { width: colTotal - 10, align: "right" });

    tableY += 22;

    doc.font("Helvetica").fontSize(9).fillColor("#000000");

    for (const line of data.lines) {
      if (tableY > doc.page.height - 120) {
        doc.addPage();
        tableY = 50;
      }

      const itemName = line.descriptionOverride || line.productName || "Unknown Item";
      const sku = line.productSku || "";

      const nameHeight = doc.heightOfString(itemName, { width: colItem - 10 });
      const rowHeight = Math.max(nameHeight + 6, 18);

      if ((data.lines.indexOf(line) % 2) === 1) {
        doc.rect(tableLeft, tableY, pageWidth, rowHeight).fill("#f9f9f9");
        doc.fillColor("#000000");
      }

      doc.text(itemName, tableLeft + 5, tableY + 4, { width: colItem - 10 });
      doc.text(sku, tableLeft + colItem + 5, tableY + 4, { width: colSku - 10 });
      doc.text(String(line.quantity), tableLeft + colItem + colSku + 5, tableY + 4, { width: colQty - 10, align: "center" });
      doc.text(formatCurrency(line.unitPrice), tableLeft + colItem + colSku + colQty + 5, tableY + 4, { width: colPrice - 10, align: "right" });
      doc.text(formatCurrency(line.lineTotal), tableLeft + colItem + colSku + colQty + colPrice + 5, tableY + 4, { width: colTotal - 10, align: "right" });

      tableY += rowHeight + 2;
    }

    doc.moveDown(0.5);
    doc.y = tableY + 10;

    doc.moveTo(50, doc.y).lineTo(50 + pageWidth, doc.y).strokeColor("#cccccc").stroke();
    doc.moveDown(0.5);

    const totalsX = 50 + pageWidth - 200;
    const totalsValueX = 50 + pageWidth - 80;

    doc.fontSize(10).font("Helvetica").fillColor("#666666");
    doc.text("Subtotal:", totalsX, doc.y, { width: 100, align: "left" });
    doc.fillColor("#000000").text(formatCurrency(data.order.subtotal), totalsValueX, doc.y - doc.currentLineHeight(), { width: 80, align: "right" });

    doc.moveDown(0.3);
    doc.fillColor("#666666").text("Tax (GST):", totalsX, doc.y, { width: 100, align: "left" });
    doc.fillColor("#000000").text(formatCurrency(data.order.tax), totalsValueX, doc.y - doc.currentLineHeight(), { width: 80, align: "right" });

    doc.moveDown(0.3);
    doc.moveTo(totalsX, doc.y).lineTo(50 + pageWidth, doc.y).strokeColor("#cccccc").stroke();
    doc.moveDown(0.3);

    doc.fontSize(12).font("Helvetica-Bold").fillColor("#000000");
    doc.text("Total:", totalsX, doc.y, { width: 100, align: "left" });
    doc.text(formatCurrency(data.order.total), totalsValueX, doc.y - doc.currentLineHeight(), { width: 80, align: "right" });

    if (data.order.customerNotes) {
      doc.moveDown(1);
      doc.moveTo(50, doc.y).lineTo(50 + pageWidth, doc.y).strokeColor("#cccccc").stroke();
      doc.moveDown(0.5);
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#000000").text("Customer Notes");
      doc.moveDown(0.3);
      doc.fontSize(9).font("Helvetica").text(data.order.customerNotes, { width: pageWidth });
    }

    if (data.order.internalNotes) {
      doc.moveDown(0.5);
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#000000").text("Internal Notes");
      doc.moveDown(0.3);
      doc.fontSize(9).font("Helvetica").text(data.order.internalNotes, { width: pageWidth });
    }

    doc.moveDown(2);
    doc.fontSize(7).font("Helvetica").fillColor("#999999")
      .text(`Generated on ${new Date().toLocaleString("en-AU", { timeZone: "Australia/Sydney" })} | Purax Feather Holdings Pty Ltd`, { align: "center" });

    doc.end();
  });
}

function formatDate(date: Date | string | null): string {
  if (!date) return "N/A";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

function formatCurrency(value: string | number | null): string {
  if (value === null || value === undefined) return "$0.00";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return `$${num.toFixed(2)}`;
}
