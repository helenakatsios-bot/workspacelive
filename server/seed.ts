import { db } from "./db";
import { 
  users, companies, contacts, deals, products, quotes, quoteLines,
  orders, orderLines, invoices, activities
} from "@shared/schema";
import bcrypt from "bcrypt";
import { sql } from "drizzle-orm";

export async function seedDatabase() {
  console.log("Checking if database needs seeding...");

  // Check if we already have users
  const existingUsers = await db.select().from(users).limit(1);
  if (existingUsers.length > 0) {
    console.log("Database already seeded, skipping...");
    return;
  }

  console.log("Seeding database with sample data...");

  // Create demo users with different roles
  const passwordHash = await bcrypt.hash("admin123", 10);
  const officeHash = await bcrypt.hash("office123", 10);
  const warehouseHash = await bcrypt.hash("warehouse123", 10);

  const [adminUser] = await db.insert(users).values([
    { name: "John Admin", email: "admin@company.com", passwordHash, role: "admin", active: true },
    { name: "Sarah Office", email: "office@company.com", passwordHash: officeHash, role: "office", active: true },
    { name: "Mike Warehouse", email: "warehouse@company.com", passwordHash: warehouseHash, role: "warehouse", active: true },
    { name: "Jane Viewer", email: "viewer@company.com", passwordHash: await bcrypt.hash("viewer123", 10), role: "readonly", active: true },
  ]).returning();

  // Create companies
  const createdCompanies = await db.insert(companies).values([
    {
      legalName: "Acme Manufacturing Pty Ltd",
      tradingName: "Acme Manufacturing",
      abn: "12 345 678 901",
      billingAddress: "123 Industrial Way\nSydney NSW 2000",
      shippingAddress: "456 Warehouse Rd\nSydney NSW 2000",
      paymentTerms: "Net 30",
      creditStatus: "active",
      tags: ["wholesale", "priority"],
      internalNotes: "Long-term customer since 2019. Always pays on time.",
    },
    {
      legalName: "BuildRight Construction Ltd",
      tradingName: "BuildRight",
      abn: "98 765 432 109",
      billingAddress: "789 Builder St\nMelbourne VIC 3000",
      shippingAddress: "789 Builder St\nMelbourne VIC 3000",
      paymentTerms: "Net 14",
      creditStatus: "active",
      tags: ["construction"],
      internalNotes: "Growing account with high potential.",
    },
    {
      legalName: "Coastal Traders Pty Ltd",
      tradingName: "Coastal Traders",
      abn: "11 222 333 444",
      billingAddress: "55 Beach Rd\nBrisbane QLD 4000",
      shippingAddress: "55 Beach Rd\nBrisbane QLD 4000",
      paymentTerms: "Net 30",
      creditStatus: "active",
      tags: ["retail", "wholesale"],
    },
    {
      legalName: "Pacific Industries Group",
      tradingName: "Pacific Industries",
      abn: "55 666 777 888",
      billingAddress: "100 Corporate Plaza\nPerth WA 6000",
      shippingAddress: "200 Distribution Centre\nPerth WA 6000",
      paymentTerms: "Net 60",
      creditStatus: "on_hold",
      tags: ["enterprise"],
      internalNotes: "On hold due to overdue payments. Contact finance before processing orders.",
    },
    {
      legalName: "Metro Supplies Co",
      tradingName: "Metro Supplies",
      abn: "99 888 777 666",
      billingAddress: "42 Metro Lane\nAdelaide SA 5000",
      shippingAddress: "42 Metro Lane\nAdelaide SA 5000",
      paymentTerms: "Net 30",
      creditStatus: "active",
      tags: ["wholesale"],
    },
  ]).returning();

  // Create contacts
  const createdContacts = await db.insert(contacts).values([
    { companyId: createdCompanies[0].id, firstName: "Tom", lastName: "Harris", email: "tom@acme.com.au", phone: "0412 345 678", position: "Purchasing Manager", preferredContactMethod: "email" },
    { companyId: createdCompanies[0].id, firstName: "Lisa", lastName: "Chen", email: "lisa@acme.com.au", phone: "0423 456 789", position: "Operations Director" },
    { companyId: createdCompanies[1].id, firstName: "Mark", lastName: "Johnson", email: "mark@buildright.com.au", phone: "0434 567 890", position: "Site Manager" },
    { companyId: createdCompanies[2].id, firstName: "Emma", lastName: "Williams", email: "emma@coastal.com.au", phone: "0445 678 901", position: "Owner" },
    { companyId: createdCompanies[3].id, firstName: "David", lastName: "Brown", email: "david@pacific.com.au", phone: "0456 789 012", position: "CFO" },
    { companyId: createdCompanies[4].id, firstName: "Sophie", lastName: "Taylor", email: "sophie@metro.com.au", phone: "0467 890 123", position: "Buyer" },
  ]).returning();

  // Create products
  const createdProducts = await db.insert(products).values([
    { sku: "STL-001", name: "Steel Beam 100mm", description: "High-grade structural steel beam, 100mm width", category: "Steel", unitPrice: "245.00", costPrice: "180.00", active: true },
    { sku: "STL-002", name: "Steel Beam 150mm", description: "High-grade structural steel beam, 150mm width", category: "Steel", unitPrice: "365.00", costPrice: "270.00", active: true },
    { sku: "ALU-001", name: "Aluminium Sheet 2mm", description: "Marine-grade aluminium sheet, 2mm thickness", category: "Aluminium", unitPrice: "125.00", costPrice: "85.00", active: true },
    { sku: "ALU-002", name: "Aluminium Tube 50mm", description: "Extruded aluminium tube, 50mm diameter", category: "Aluminium", unitPrice: "78.50", costPrice: "55.00", active: true },
    { sku: "FAS-001", name: "Industrial Bolts M12", description: "High-tensile bolts, M12 x 50mm, pack of 100", category: "Fasteners", unitPrice: "45.00", costPrice: "28.00", active: true },
    { sku: "FAS-002", name: "Industrial Nuts M12", description: "High-tensile nuts, M12, pack of 100", category: "Fasteners", unitPrice: "22.00", costPrice: "12.00", active: true },
    { sku: "TOL-001", name: "Cutting Wheel 125mm", description: "Abrasive cutting wheel, 125mm diameter", category: "Tools", unitPrice: "8.50", costPrice: "4.50", active: true },
    { sku: "TOL-002", name: "Grinding Disc 180mm", description: "Industrial grinding disc, 180mm diameter", category: "Tools", unitPrice: "12.00", costPrice: "6.50", active: true },
  ]).returning();

  // Create deals
  await db.insert(deals).values([
    { companyId: createdCompanies[0].id, contactId: createdContacts[0].id, dealName: "Q1 Steel Order", pipelineStage: "negotiation", estimatedValue: "45000.00", probability: 75, expectedCloseDate: new Date("2026-03-15"), ownerUserId: adminUser.id },
    { companyId: createdCompanies[1].id, contactId: createdContacts[2].id, dealName: "New Site Materials", pipelineStage: "quote_sent", estimatedValue: "28000.00", probability: 50, expectedCloseDate: new Date("2026-02-28"), ownerUserId: adminUser.id },
    { companyId: createdCompanies[2].id, contactId: createdContacts[3].id, dealName: "Coastal Expansion", pipelineStage: "lead", estimatedValue: "15000.00", probability: 20, expectedCloseDate: new Date("2026-04-30") },
    { companyId: createdCompanies[4].id, contactId: createdContacts[5].id, dealName: "Annual Supply Contract", pipelineStage: "qualified", estimatedValue: "85000.00", probability: 40, expectedCloseDate: new Date("2026-06-30") },
    { companyId: createdCompanies[0].id, contactId: createdContacts[1].id, dealName: "Aluminium Retrofit", pipelineStage: "won", estimatedValue: "32000.00", probability: 100 },
    { companyId: createdCompanies[1].id, contactId: createdContacts[2].id, dealName: "Previous Quarter", pipelineStage: "lost", estimatedValue: "18000.00", probability: 0 },
  ]);

  // Create orders with various dates (including some from July 2021 onwards)
  const orderDates = [
    new Date("2021-07-15"),
    new Date("2021-09-22"),
    new Date("2022-01-10"),
    new Date("2022-06-05"),
    new Date("2023-03-18"),
    new Date("2023-08-25"),
    new Date("2024-01-12"),
    new Date("2024-06-30"),
    new Date("2025-02-14"),
    new Date("2025-08-05"),
    new Date("2025-12-01"),
    new Date("2026-01-15"),
    new Date("2026-01-28"),
  ];

  const orderStatuses = ["new", "confirmed", "in_production", "ready", "dispatched", "completed", "completed", "completed", "completed", "completed", "completed", "completed", "new"];

  const createdOrders = await db.insert(orders).values(orderDates.map((date, i) => ({
    orderNumber: `ORD-${2021 + Math.floor(i / 4)}-${String(i + 1).padStart(4, "0")}`,
    companyId: createdCompanies[i % createdCompanies.length].id,
    contactId: createdContacts[i % createdContacts.length].id,
    status: orderStatuses[i],
    orderDate: date,
    requestedShipDate: new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000),
    shippingMethod: ["Standard", "Express", "Pickup"][i % 3],
    subtotal: String(1000 + i * 500),
    tax: String((1000 + i * 500) * 0.1),
    total: String((1000 + i * 500) * 1.1),
    internalNotes: i % 3 === 0 ? "Priority customer - expedite if possible" : null,
    customerNotes: i % 4 === 0 ? "Please deliver between 9am and 5pm" : null,
    createdBy: adminUser.id,
  }))).returning();

  // Create order lines
  for (const order of createdOrders) {
    const numLines = (parseInt(order.orderNumber.split("-")[2]) % 3) + 1;
    for (let j = 0; j < numLines; j++) {
      const product = createdProducts[(createdOrders.indexOf(order) + j) % createdProducts.length];
      const quantity = (j + 1) * 5;
      const unitPrice = parseFloat(product.unitPrice);
      await db.insert(orderLines).values({
        orderId: order.id,
        productId: product.id,
        descriptionOverride: product.name,
        quantity,
        unitPrice: product.unitPrice,
        discount: "0",
        lineTotal: String(quantity * unitPrice),
      });
    }
  }

  // Create invoices
  await db.insert(invoices).values([
    { invoiceNumber: "INV-2025-0001", orderId: createdOrders[8].id, companyId: createdOrders[8].companyId, status: "paid", issueDate: new Date("2025-02-20"), dueDate: new Date("2025-03-22"), subtotal: createdOrders[8].subtotal, tax: createdOrders[8].tax, total: createdOrders[8].total, balanceDue: "0" },
    { invoiceNumber: "INV-2025-0002", orderId: createdOrders[9].id, companyId: createdOrders[9].companyId, status: "paid", issueDate: new Date("2025-08-10"), dueDate: new Date("2025-09-09"), subtotal: createdOrders[9].subtotal, tax: createdOrders[9].tax, total: createdOrders[9].total, balanceDue: "0" },
    { invoiceNumber: "INV-2025-0003", orderId: createdOrders[10].id, companyId: createdOrders[10].companyId, status: "sent", issueDate: new Date("2025-12-05"), dueDate: new Date("2026-01-04"), subtotal: createdOrders[10].subtotal, tax: createdOrders[10].tax, total: createdOrders[10].total, balanceDue: createdOrders[10].total },
    { invoiceNumber: "INV-2026-0001", orderId: createdOrders[11].id, companyId: createdOrders[11].companyId, status: "draft", issueDate: new Date("2026-01-20"), dueDate: new Date("2026-02-19"), subtotal: createdOrders[11].subtotal, tax: createdOrders[11].tax, total: createdOrders[11].total, balanceDue: createdOrders[11].total },
  ]);

  // Create activity entries
  for (const company of createdCompanies) {
    await db.insert(activities).values({
      entityType: "company",
      entityId: company.id,
      activityType: "system",
      content: "Company created",
      createdBy: adminUser.id,
    });
  }

  for (const order of createdOrders.slice(0, 5)) {
    await db.insert(activities).values([
      { entityType: "order", entityId: order.id, activityType: "system", content: "Order created", createdBy: adminUser.id },
      { entityType: "order", entityId: order.id, activityType: "note", content: "Customer confirmed order details via email", createdBy: adminUser.id },
    ]);
  }

  console.log("Database seeded successfully!");
  console.log(`Created: ${createdCompanies.length} companies, ${createdContacts.length} contacts, ${createdProducts.length} products, ${createdOrders.length} orders`);
}
