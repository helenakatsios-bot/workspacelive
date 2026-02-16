import * as cheerio from "cheerio";
import PDFDocument from "pdfkit";

interface ParsedItem {
  name: string;
  variant: string;
  price: string;
  qty: string;
  total: string;
}

interface ParsedOrder {
  header: string;
  items: ParsedItem[];
  subtotal: string;
  shipping: string;
  shippingLabel: string;
  total: string;
  paymentMethod: string;
  deliveryMethod: string;
  addressLines: string[];
  phone: string;
}

function parseShopifyEmail(html: string): ParsedOrder {
  const $ = cheerio.load(html);
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();

  const result: ParsedOrder = {
    header: "",
    items: [],
    subtotal: "",
    shipping: "",
    shippingLabel: "Shipping",
    total: "",
    paymentMethod: "",
    deliveryMethod: "",
    addressLines: [],
    phone: "",
  };

  const orderMatch = bodyText.match(/([\w\s.\-']+?)\s+placed order\s+#?(\d+)\s+on\s+([^.]+)/i);
  if (orderMatch) {
    result.header = `${orderMatch[1].trim()} placed order #${orderMatch[2]} on ${orderMatch[3].trim()}.`;
  }

  // Method 1: Parse using Shopify CSS classes (direct emails)
  const titleEls = $(".order-list__item-title, [class*='order-list__item-title']");
  const variantEls = $(".order-list__item-variant, [class*='order-list__item-variant']");
  const priceEls = $(".order-list__item-price, [class*='order-list__item-price']");

  if (titleEls.length > 0) {
    titleEls.each((i, el) => {
      const name = $(el).text().trim();
      const variant = variantEls.eq(i).text().trim() || "";
      const priceText = priceEls.eq(i).text().trim() || "";
      const totalMatch = priceText.match(/\$\s*([\d,.]+)/);
      const total = totalMatch ? `$${totalMatch[1]}` : "";

      const parentRow = $(el).closest("tr, td").parent().closest("tr, td");
      const rowText = parentRow.text().replace(/\s+/g, " ");
      const pqMatch = rowText.match(/\$\s*([\d,.]+)\s*[×x]\s*(\d+)/);
      const price = pqMatch ? `$${pqMatch[1]}` : total;
      const qty = pqMatch ? pqMatch[2] : "1";

      if (name.length > 2) {
        result.items.push({ name, variant, price, qty, total });
      }
    });
  }

  // Method 2: Parse from inline-styled HTML (forwarded Shopify emails - no CSS classes)
  if (result.items.length === 0) {
    const allItems = [...bodyText.matchAll(/([A-Z][A-Za-z\s%'0-9()]+?)\s+\$\s*([\d,.]+)\s*[×x]\s*(\d+)\s*([\w\s/]*?)(?:\s*[•·]\s*SKU:[^\$]*)?\s*\$\s*([\d,.]+)/g)];
    for (const m of allItems) {
      const name = m[1].trim();
      if (name.length < 4 || /subtotal|shipping|total/i.test(name)) continue;
      let variant = m[4]?.trim() || "";
      variant = variant.replace(/\s*[•·]\s*SKU:.*$/i, "").trim();
      result.items.push({
        name,
        variant,
        price: `$${m[2]}`,
        qty: m[3],
        total: `$${m[5]}`,
      });
    }
  }

  // Method 3: Try table-based extraction as last resort
  if (result.items.length === 0) {
    const itemTableTexts: string[] = [];
    $("table").each((_, table) => {
      const text = $(table).text().replace(/\s+/g, " ").trim();
      if (text.length > 30 && text.length < 200 && text.includes("$") && (text.includes("×") || text.includes(" x "))) {
        if (!itemTableTexts.some(t => text.includes(t) || t.includes(text))) {
          itemTableTexts.push(text);
        }
      }
    });

    for (const text of itemTableTexts) {
      const nameMatch = text.match(/^(.+?)\s+\$\s*([\d,.]+)\s*[×x]\s*(\d+)/);
      if (nameMatch) {
        const name = nameMatch[1].trim();
        if (name.length < 4 || /subtotal|shipping|total/i.test(name)) continue;
        const price = `$${nameMatch[2]}`;
        const qty = nameMatch[3];

        let variant = "";
        const afterQty = text.substring(text.indexOf(nameMatch[0]) + nameMatch[0].length).trim();
        const variantMatch = afterQty.match(/^([A-Za-z\s/]+(?:\s*\/\s*[A-Za-z\s]+)*)/);
        if (variantMatch && variantMatch[1].trim().length > 0) {
          variant = variantMatch[1].trim().replace(/\s*[•·]\s*SKU:.*$/i, "").trim();
        }

        const totalMatch = afterQty.match(/\$\s*([\d,.]+)/);
        const total = totalMatch ? `$${totalMatch[1]}` : "";

        result.items.push({ name, variant, price, qty, total });
      }
    }
  }

  const subtotalMatch = bodyText.match(/Subtotal\s+\$([\d,.]+)/);
  if (subtotalMatch) result.subtotal = `$${subtotalMatch[1]}`;

  const shippingMatch = bodyText.match(/Shipping\s*\(([^)]+)\)\s+\$([\d,.]+)/);
  if (shippingMatch) {
    result.shippingLabel = `Shipping (${shippingMatch[1]})`;
    result.shipping = `$${shippingMatch[2]}`;
  } else {
    const simpleShip = bodyText.match(/Shipping\s+\$([\d,.]+)/);
    if (simpleShip) result.shipping = `$${simpleShip[1]}`;
  }

  const totalMatch = bodyText.match(/Total\s+\$([\d,.]+)\s*AUD/i) || bodyText.match(/Total\s+\$([\d,.]+)/);
  if (totalMatch) result.total = `$${totalMatch[1]}`;

  const paymentMatch = bodyText.match(/Payment processing method\s+(.+?)(?=Delivery|Shipping address|$)/i);
  if (paymentMatch) result.paymentMethod = paymentMatch[1].trim().split(/\s{2,}/)[0];

  const deliveryMatch = bodyText.match(/Delivery method\s+(.+?)(?=Shipping address|Payment|$)/i);
  if (deliveryMatch) result.deliveryMethod = deliveryMatch[1].trim().split(/\s{2,}/)[0];

  const addressMatch = bodyText.match(/Shipping address\s+(.+?)(?=Payment processing|Billing address|$)/i);
  if (addressMatch) {
    let raw = addressMatch[1].trim();
    const phoneMatch = raw.match(/(\+?\d[\d\s]{8,}\d)/);
    if (phoneMatch) {
      result.phone = phoneMatch[1].trim();
      raw = raw.replace(result.phone, "").trim();
    }
    const cleaned = raw.replace(/\s{2,}/g, "\n").split("\n").map(s => s.trim()).filter(s => s.length > 0);
    const trailing = raw.indexOf("151 O'Connor") || raw.indexOf("Purax");
    if (trailing > 0) {
      // Cut off company footer
    }
    result.addressLines = cleaned.filter(l => !l.includes("O'Connor") && !l.includes("Purax") && !l.includes("Hawthorn"));
  }

  return result;
}

function extractPlainText(html: string): string {
  const $ = cheerio.load(html);
  $("style, script, head").remove();
  const text = $("body").text();
  return text
    .split(/\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

export interface OrderContext {
  customerName?: string;
  customerAddress?: string;
  customerPhone?: string;
  customerEmail?: string;
}

export async function convertHtmlToPdf(html: string, orderContext?: OrderContext): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const parsed = parseShopifyEmail(html);
    const pageWidth = doc.page.width - 100;

    const isShopifyFormat = parsed.items.length > 0 || parsed.subtotal || parsed.total;

    if (!isShopifyFormat) {
      doc.fontSize(9).font("Helvetica").fillColor("#999999")
        .text("Original Order Email", { align: "center" });
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(50 + pageWidth, doc.y).strokeColor("#dddddd").stroke();
      doc.moveDown(1);

      const plainText = extractPlainText(html);
      doc.fontSize(10).font("Helvetica").fillColor("#000000");
      const lines = plainText.split("\n");
      for (const line of lines) {
        if (doc.y > doc.page.height - 80) doc.addPage();
        doc.text(line, { width: pageWidth });
      }
      doc.end();
      return;
    }

    if (parsed.header) {
      doc.fontSize(10).font("Helvetica").fillColor("#999999").text(parsed.header);
      doc.moveDown(1.5);
    }

    doc.moveTo(50, doc.y).lineTo(50 + pageWidth, doc.y).strokeColor("#dddddd").stroke();
    doc.moveDown(1.5);

    doc.fontSize(22).font("Helvetica-Bold").fillColor("#000000").text("Order summary");
    doc.moveDown(1.2);

    for (const item of parsed.items) {
      if (doc.y > doc.page.height - 180) doc.addPage();

      const nameY = doc.y;
      doc.fontSize(16).font("Helvetica-Bold").fillColor("#000000");
      doc.text(item.name, 50, nameY, { width: pageWidth - 100 });

      if (item.total) {
        doc.fontSize(14).font("Helvetica").fillColor("#000000");
        doc.text(item.total, 50 + pageWidth - 80, nameY, { width: 80, align: "right" });
      }

      doc.y = Math.max(doc.y, nameY + 20);

      if (item.price && item.qty) {
        doc.fontSize(10).font("Helvetica").fillColor("#999999");
        doc.text(`${item.price} x ${item.qty}`, 60);
      }

      if (item.variant) {
        doc.moveDown(0.2);
        doc.fontSize(14).font("Helvetica").fillColor("#666666");
        doc.text(item.variant, 60);
      }

      doc.moveDown(1.2);
    }

    if (parsed.items.length === 0) {
      doc.fontSize(10).font("Helvetica").fillColor("#999999").text("(No items parsed from email)");
      doc.moveDown(1);
    }

    doc.moveTo(50, doc.y).lineTo(50 + pageWidth, doc.y).strokeColor("#dddddd").stroke();
    doc.moveDown(0.5);

    const valX = 50 + pageWidth - 100;

    if (parsed.subtotal) {
      doc.fontSize(10).font("Helvetica").fillColor("#000000");
      doc.text("Subtotal", 50, doc.y);
      doc.text(parsed.subtotal, valX, doc.y - doc.currentLineHeight(), { width: 100, align: "right" });
      doc.moveDown(0.4);
    }

    if (parsed.shipping !== undefined) {
      doc.fontSize(10).font("Helvetica").fillColor("#000000");
      doc.text(parsed.shippingLabel, 50, doc.y);
      doc.text(parsed.shipping || "$0.00", valX, doc.y - doc.currentLineHeight(), { width: 100, align: "right" });
      doc.moveDown(0.4);
    }

    if (parsed.total) {
      doc.fontSize(12).font("Helvetica-Bold").fillColor("#000000");
      const totalY = doc.y;
      doc.text("Total", 50, totalY);
      doc.text(`${parsed.total} AUD`, valX - 20, totalY, { width: 120, align: "right" });
      doc.moveDown(1.2);
    }

    doc.moveTo(50, doc.y).lineTo(50 + pageWidth, doc.y).strokeColor("#e8c878").lineWidth(1.5).stroke();
    doc.moveDown(1.5);

    if (parsed.paymentMethod) {
      doc.fontSize(12).font("Helvetica-Bold").fillColor("#000000").text("Payment processing method");
      doc.moveDown(0.3);
      doc.fontSize(11).font("Helvetica").fillColor("#333333").text(parsed.paymentMethod);
      doc.moveDown(1.2);
    }

    if (parsed.deliveryMethod) {
      doc.fontSize(12).font("Helvetica-Bold").fillColor("#000000").text("Delivery method");
      doc.moveDown(0.3);
      doc.fontSize(11).font("Helvetica").fillColor("#333333").text(parsed.deliveryMethod);
      doc.moveDown(1.2);
    }

    const addressLines = orderContext?.customerAddress
      ? orderContext.customerAddress.split("\n").map(l => l.trim()).filter(l => l.length > 0)
      : parsed.addressLines;
    const customerName = orderContext?.customerName || "";
    const phone = orderContext?.customerPhone || parsed.phone;

    if (addressLines.length > 0 || customerName) {
      doc.fontSize(12).font("Helvetica-Bold").fillColor("#000000").text("Shipping address");
      doc.moveDown(0.3);
      doc.fontSize(11).font("Helvetica").fillColor("#333333");
      if (customerName) {
        doc.text(customerName);
        doc.moveDown(0.2);
      }
      for (const line of addressLines) {
        doc.text(line);
        doc.moveDown(0.2);
      }
      doc.moveDown(0.5);
    }

    if (phone) {
      doc.fontSize(11).font("Helvetica").fillColor("#333333").text(phone);
      doc.moveDown(1);
    }

    doc.end();
  });
}
