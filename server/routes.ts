import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import { storage } from "./storage";
import bcrypt from "bcrypt";
import { z } from "zod";
import { loginSchema, insertCompanySchema, insertContactSchema, insertDealSchema, insertProductSchema, insertOrderSchema, insertActivitySchema } from "@shared/schema";
import { createXeroClient, getStoredToken, saveXeroToken, deleteXeroToken, refreshTokenIfNeeded, importContactsFromXero, syncInvoiceToXero } from "./xero";
import { getOutlookAuthUrl, exchangeCodeForTokens, getStoredOutlookToken, saveOutlookToken, deleteOutlookToken, refreshOutlookTokenIfNeeded, syncEmailsToDatabase, sendEmail, getEmailsForCompany, getEmailsForContact, getAllEmails } from "./outlook";

declare module "express-session" {
  interface SessionData {
    userId: string;
    xeroState?: string;
    outlookState?: string;
  }
}

// Middleware to check authentication
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

// Middleware to check admin role
async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const user = await storage.getUser(req.session.userId);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

// Middleware to check edit permissions
async function requireEdit(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const user = await storage.getUser(req.session.userId);
  if (!user || (user.role !== "admin" && user.role !== "office")) {
    return res.status(403).json({ message: "Edit access required" });
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Session configuration - require SESSION_SECRET in production
  const sessionSecret = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === "production" && !sessionSecret) {
    throw new Error("SESSION_SECRET environment variable is required in production");
  }
  
  app.use(
    session({
      secret: sessionSecret || "dev-only-secret-do-not-use-in-production",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      },
    })
  );

  // ==================== AUTH ROUTES ====================
  app.post("/api/auth/login", async (req, res) => {
    try {
      const data = loginSchema.parse(req.body);
      const user = await storage.getUserByEmail(data.email);
      
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const validPassword = await bcrypt.compare(data.password, user.passwordHash);
      if (!validPassword) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      if (!user.active) {
        return res.status(403).json({ message: "Account is disabled" });
      }

      req.session.userId = user.id;
      await storage.updateUser(user.id, { lastLogin: new Date() } as any);
      await storage.createAuditLog({
        userId: user.id,
        action: "login",
        entityType: "user",
        entityId: user.id,
      });

      const { passwordHash, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Login error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.json({ message: "Logged out" });
    });
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    const { passwordHash, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  });

  // ==================== DASHBOARD ROUTES ====================
  app.get("/api/dashboard/stats", requireAuth, async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      console.error("Dashboard stats error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Critical: Clients who ordered since July 1, 2021
  app.get("/api/reports/clients-by-order-date", requireAuth, async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const start = startDate ? new Date(startDate as string) : new Date("2021-07-01");
      const end = endDate ? new Date(endDate as string) : new Date();
      const companies = await storage.getCompaniesWithOrdersInDateRange(start, end);
      res.json(companies);
    } catch (error) {
      console.error("Clients by order date error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ==================== COMPANIES ROUTES ====================
  app.get("/api/companies", requireAuth, async (req, res) => {
    try {
      const companies = await storage.getAllCompanies();
      res.json(companies);
    } catch (error) {
      console.error("Get companies error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/companies/:id", requireAuth, async (req, res) => {
    try {
      const company = await storage.getCompany(req.params.id);
      if (!company) {
        return res.status(404).json({ message: "Company not found" });
      }
      res.json(company);
    } catch (error) {
      console.error("Get company error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/companies/:id/contacts", requireAuth, async (req, res) => {
    try {
      const contacts = await storage.getContactsByCompany(req.params.id);
      res.json(contacts);
    } catch (error) {
      console.error("Get company contacts error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/companies/:id/orders", requireAuth, async (req, res) => {
    try {
      const orders = await storage.getOrdersByCompany(req.params.id);
      res.json(orders);
    } catch (error) {
      console.error("Get company orders error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/companies/:id/activities", requireAuth, async (req, res) => {
    try {
      const activities = await storage.getActivitiesByEntity("company", req.params.id);
      res.json(activities);
    } catch (error) {
      console.error("Get company activities error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/companies", requireEdit, async (req, res) => {
    try {
      const data = insertCompanySchema.parse(req.body);
      const company = await storage.createCompany(data);
      await storage.createAuditLog({
        userId: req.session.userId,
        action: "create",
        entityType: "company",
        entityId: company.id,
        afterJson: company,
      });
      await storage.createActivity({
        entityType: "company",
        entityId: company.id,
        activityType: "system",
        content: "Company created",
        createdBy: req.session.userId,
      });
      res.status(201).json(company);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create company error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/companies/:id", requireEdit, async (req, res) => {
    try {
      const before = await storage.getCompany(req.params.id);
      if (!before) {
        return res.status(404).json({ message: "Company not found" });
      }
      const company = await storage.updateCompany(req.params.id, req.body);
      await storage.createAuditLog({
        userId: req.session.userId,
        action: "update",
        entityType: "company",
        entityId: req.params.id,
        beforeJson: before,
        afterJson: company,
      });
      if (req.body.creditStatus && req.body.creditStatus !== before.creditStatus) {
        await storage.createActivity({
          entityType: "company",
          entityId: req.params.id,
          activityType: "status_change",
          content: `Credit status changed from ${before.creditStatus} to ${req.body.creditStatus}`,
          createdBy: req.session.userId,
        });
      }
      res.json(company);
    } catch (error) {
      console.error("Update company error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/companies/:id/activities", requireEdit, async (req, res) => {
    try {
      const activity = await storage.createActivity({
        entityType: "company",
        entityId: req.params.id,
        activityType: req.body.activityType,
        content: req.body.content,
        createdBy: req.session.userId,
      });
      res.status(201).json(activity);
    } catch (error) {
      console.error("Create activity error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ==================== CONTACTS ROUTES ====================
  app.get("/api/contacts", requireAuth, async (req, res) => {
    try {
      const contacts = await storage.getAllContacts();
      const companies = await storage.getAllCompanies();
      const companyMap = new Map(companies.map(c => [c.id, c]));
      const contactsWithCompany = contacts.map(contact => ({
        ...contact,
        company: companyMap.get(contact.companyId),
      }));
      res.json(contactsWithCompany);
    } catch (error) {
      console.error("Get contacts error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/contacts/:id", requireAuth, async (req, res) => {
    try {
      const contact = await storage.getContact(req.params.id);
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      const company = await storage.getCompany(contact.companyId);
      res.json({ ...contact, company });
    } catch (error) {
      console.error("Get contact error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/contacts", requireEdit, async (req, res) => {
    try {
      const data = insertContactSchema.parse(req.body);
      const contact = await storage.createContact(data);
      await storage.createAuditLog({
        userId: req.session.userId,
        action: "create",
        entityType: "contact",
        entityId: contact.id,
        afterJson: contact,
      });
      res.status(201).json(contact);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create contact error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/contacts/:id", requireEdit, async (req, res) => {
    try {
      const before = await storage.getContact(req.params.id);
      const contact = await storage.updateContact(req.params.id, req.body);
      await storage.createAuditLog({
        userId: req.session.userId,
        action: "update",
        entityType: "contact",
        entityId: req.params.id,
        beforeJson: before,
        afterJson: contact,
      });
      res.json(contact);
    } catch (error) {
      console.error("Update contact error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ==================== DEALS ROUTES ====================
  app.get("/api/deals", requireAuth, async (req, res) => {
    try {
      const deals = await storage.getAllDeals();
      const companies = await storage.getAllCompanies();
      const contacts = await storage.getAllContacts();
      const companyMap = new Map(companies.map(c => [c.id, c]));
      const contactMap = new Map(contacts.map(c => [c.id, c]));
      const dealsWithRelations = deals.map(deal => ({
        ...deal,
        company: companyMap.get(deal.companyId),
        contact: deal.contactId ? contactMap.get(deal.contactId) : null,
      }));
      res.json(dealsWithRelations);
    } catch (error) {
      console.error("Get deals error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/deals/:id", requireAuth, async (req, res) => {
    try {
      const deal = await storage.getDeal(req.params.id);
      if (!deal) {
        return res.status(404).json({ message: "Deal not found" });
      }
      const company = await storage.getCompany(deal.companyId);
      const contact = deal.contactId ? await storage.getContact(deal.contactId) : null;
      res.json({ ...deal, company, contact });
    } catch (error) {
      console.error("Get deal error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/deals", requireEdit, async (req, res) => {
    try {
      const data = insertDealSchema.parse(req.body);
      const deal = await storage.createDeal(data);
      await storage.createAuditLog({
        userId: req.session.userId,
        action: "create",
        entityType: "deal",
        entityId: deal.id,
        afterJson: deal,
      });
      res.status(201).json(deal);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create deal error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/deals/:id", requireEdit, async (req, res) => {
    try {
      const before = await storage.getDeal(req.params.id);
      const deal = await storage.updateDeal(req.params.id, req.body);
      await storage.createAuditLog({
        userId: req.session.userId,
        action: "update",
        entityType: "deal",
        entityId: req.params.id,
        beforeJson: before,
        afterJson: deal,
      });
      res.json(deal);
    } catch (error) {
      console.error("Update deal error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ==================== PRODUCTS ROUTES ====================
  app.get("/api/products", requireAuth, async (req, res) => {
    try {
      const products = await storage.getAllProducts();
      res.json(products);
    } catch (error) {
      console.error("Get products error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/products/:id", requireAuth, async (req, res) => {
    try {
      const product = await storage.getProduct(req.params.id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json(product);
    } catch (error) {
      console.error("Get product error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/products", requireEdit, async (req, res) => {
    try {
      const data = insertProductSchema.parse(req.body);
      const product = await storage.createProduct(data);
      await storage.createAuditLog({
        userId: req.session.userId,
        action: "create",
        entityType: "product",
        entityId: product.id,
        afterJson: product,
      });
      res.status(201).json(product);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create product error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/products/:id", requireEdit, async (req, res) => {
    try {
      const before = await storage.getProduct(req.params.id);
      const product = await storage.updateProduct(req.params.id, req.body);
      await storage.createAuditLog({
        userId: req.session.userId,
        action: "update",
        entityType: "product",
        entityId: req.params.id,
        beforeJson: before,
        afterJson: product,
      });
      res.json(product);
    } catch (error) {
      console.error("Update product error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ==================== QUOTES ROUTES ====================
  app.get("/api/quotes", requireAuth, async (req, res) => {
    try {
      const quotes = await storage.getAllQuotes();
      const companies = await storage.getAllCompanies();
      const companyMap = new Map(companies.map(c => [c.id, c]));
      const quotesWithCompany = quotes.map(quote => ({
        ...quote,
        company: companyMap.get(quote.companyId),
      }));
      res.json(quotesWithCompany);
    } catch (error) {
      console.error("Get quotes error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/quotes/:id", requireAuth, async (req, res) => {
    try {
      const quote = await storage.getQuote(req.params.id);
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }
      const company = await storage.getCompany(quote.companyId);
      const lines = await storage.getQuoteLines(quote.id);
      res.json({ ...quote, company, lines });
    } catch (error) {
      console.error("Get quote error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ==================== ORDERS ROUTES ====================
  app.get("/api/orders", requireAuth, async (req, res) => {
    try {
      const orders = await storage.getAllOrders();
      const companies = await storage.getAllCompanies();
      const companyMap = new Map(companies.map(c => [c.id, c]));
      const ordersWithCompany = orders.map(order => ({
        ...order,
        company: companyMap.get(order.companyId),
      }));
      res.json(ordersWithCompany);
    } catch (error) {
      console.error("Get orders error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/orders/:id", requireAuth, async (req, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      const company = await storage.getCompany(order.companyId);
      const contact = order.contactId ? await storage.getContact(order.contactId) : null;
      const lines = await storage.getOrderLines(order.id);
      res.json({ ...order, company, contact, lines });
    } catch (error) {
      console.error("Get order error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/orders/:id/activities", requireAuth, async (req, res) => {
    try {
      const activities = await storage.getActivitiesByEntity("order", req.params.id);
      res.json(activities);
    } catch (error) {
      console.error("Get order activities error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/orders/:id/attachments", requireAuth, async (req, res) => {
    try {
      const attachments = await storage.getAttachmentsByEntity("order", req.params.id);
      res.json(attachments);
    } catch (error) {
      console.error("Get order attachments error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/orders", requireEdit, async (req, res) => {
    try {
      const data = insertOrderSchema.parse(req.body);
      
      // Check if company is on hold
      const company = await storage.getCompany(data.companyId);
      if (company?.creditStatus === "on_hold") {
        const user = await storage.getUser(req.session.userId!);
        if (user?.role !== "admin") {
          return res.status(403).json({ message: "Cannot create orders for companies on hold" });
        }
      }

      const order = await storage.createOrder({
        ...data,
        createdBy: req.session.userId,
      });
      await storage.createAuditLog({
        userId: req.session.userId,
        action: "create",
        entityType: "order",
        entityId: order.id,
        afterJson: order,
      });
      await storage.createActivity({
        entityType: "order",
        entityId: order.id,
        activityType: "system",
        content: "Order created",
        createdBy: req.session.userId,
      });
      res.status(201).json(order);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create order error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/orders/:id", requireEdit, async (req, res) => {
    try {
      const before = await storage.getOrder(req.params.id);
      if (!before) {
        return res.status(404).json({ message: "Order not found" });
      }
      const order = await storage.updateOrder(req.params.id, req.body);
      await storage.createAuditLog({
        userId: req.session.userId,
        action: "update",
        entityType: "order",
        entityId: req.params.id,
        beforeJson: before,
        afterJson: order,
      });
      if (req.body.status && req.body.status !== before.status) {
        await storage.createActivity({
          entityType: "order",
          entityId: req.params.id,
          activityType: "status_change",
          content: `Status changed from ${before.status} to ${req.body.status}`,
          createdBy: req.session.userId,
        });
      }
      res.json(order);
    } catch (error) {
      console.error("Update order error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/orders/:id/activities", requireEdit, async (req, res) => {
    try {
      const activity = await storage.createActivity({
        entityType: "order",
        entityId: req.params.id,
        activityType: req.body.activityType,
        content: req.body.content,
        createdBy: req.session.userId,
      });
      res.status(201).json(activity);
    } catch (error) {
      console.error("Create activity error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ==================== INVOICES ROUTES ====================
  app.get("/api/invoices", requireAuth, async (req, res) => {
    try {
      const invoices = await storage.getAllInvoices();
      const companies = await storage.getAllCompanies();
      const companyMap = new Map(companies.map(c => [c.id, c]));
      const invoicesWithCompany = invoices.map(invoice => ({
        ...invoice,
        company: companyMap.get(invoice.companyId),
      }));
      res.json(invoicesWithCompany);
    } catch (error) {
      console.error("Get invoices error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/invoices/:id", requireAuth, async (req, res) => {
    try {
      const invoice = await storage.getInvoice(req.params.id);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      const company = await storage.getCompany(invoice.companyId);
      const order = invoice.orderId ? await storage.getOrder(invoice.orderId) : null;
      res.json({ ...invoice, company, order });
    } catch (error) {
      console.error("Get invoice error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ==================== ADMIN ROUTES ====================
  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      const usersWithoutPassword = users.map(({ passwordHash, ...user }) => user);
      res.json(usersWithoutPassword);
    } catch (error) {
      console.error("Get users error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/audit-logs", requireAdmin, async (req, res) => {
    try {
      const logs = await storage.getAuditLogs(100);
      const users = await storage.getAllUsers();
      const userMap = new Map(users.map(u => [u.id, u]));
      const logsWithUser = logs.map(log => ({
        ...log,
        user: log.userId ? userMap.get(log.userId) : null,
      }));
      res.json(logsWithUser);
    } catch (error) {
      console.error("Get audit logs error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ==================== XERO INTEGRATION ROUTES ====================
  
  // Get Xero connection status
  app.get("/api/xero/status", requireAdmin, async (req, res) => {
    try {
      const token = await getStoredToken();
      if (token) {
        res.json({
          connected: true,
          tenantName: token.tenantName,
          expiresAt: token.expiresAt,
        });
      } else {
        res.json({ connected: false });
      }
    } catch (error) {
      console.error("Xero status error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get Xero OAuth authorization URL
  app.get("/api/xero/auth-url", requireAdmin, async (req, res) => {
    try {
      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const redirectUri = `${protocol}://${host}/api/xero/callback`;
      
      // Generate and store state for CSRF protection
      const state = Math.random().toString(36).substring(2) + Date.now().toString(36);
      req.session.xeroState = state;
      
      const xero = createXeroClient(redirectUri);
      const consentUrl = await xero.buildConsentUrl() + `&state=${encodeURIComponent(state)}`;
      
      res.json({ url: consentUrl });
    } catch (error) {
      console.error("Xero auth URL error:", error);
      res.status(500).json({ message: "Failed to generate Xero authorization URL" });
    }
  });

  // Xero OAuth callback - requires valid session with matching state
  app.get("/api/xero/callback", async (req, res) => {
    try {
      // Validate state parameter for CSRF protection
      const returnedState = req.query.state as string | undefined;
      const sessionState = req.session.xeroState;
      
      if (!returnedState || !sessionState || returnedState !== sessionState) {
        console.error("Xero callback: state mismatch or missing session");
        return res.redirect("/admin?xero=error&reason=invalid_state");
      }
      
      // Clear state after validation
      delete req.session.xeroState;
      
      // Verify user is still logged in as admin
      if (!req.session.userId) {
        return res.redirect("/admin?xero=error&reason=not_authenticated");
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "admin") {
        return res.redirect("/admin?xero=error&reason=not_admin");
      }
      
      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const redirectUri = `${protocol}://${host}/api/xero/callback`;
      
      const xero = createXeroClient(redirectUri);
      const tokenSet = await xero.apiCallback(req.url);
      
      await xero.updateTenants();
      const activeTenant = xero.tenants[0];
      
      if (activeTenant && tokenSet.access_token && tokenSet.refresh_token) {
        await saveXeroToken(
          activeTenant.tenantId,
          activeTenant.tenantName,
          tokenSet.access_token,
          tokenSet.refresh_token,
          new Date((tokenSet.expires_at || 0) * 1000)
        );
        
        // Audit log the connection
        await storage.createAuditLog({
          userId: req.session.userId,
          action: "create",
          entityType: "xero_connection",
        });
        
        // Redirect back to admin page
        res.redirect("/admin?xero=connected");
      } else {
        res.redirect("/admin?xero=error");
      }
    } catch (error) {
      console.error("Xero callback error:", error);
      res.redirect("/admin?xero=error");
    }
  });

  // Disconnect Xero
  app.post("/api/xero/disconnect", requireAdmin, async (req, res) => {
    try {
      await deleteXeroToken();
      res.json({ success: true });
    } catch (error) {
      console.error("Xero disconnect error:", error);
      res.status(500).json({ message: "Failed to disconnect Xero" });
    }
  });

  // Import contacts from Xero
  app.post("/api/xero/import-contacts", requireAdmin, async (req, res) => {
    try {
      const token = await getStoredToken();
      if (!token) {
        return res.status(400).json({ message: "Xero not connected" });
      }
      
      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const redirectUri = `${protocol}://${host}/api/xero/callback`;
      
      const xero = createXeroClient(redirectUri);
      const refreshed = await refreshTokenIfNeeded(xero, token);
      
      if (!refreshed) {
        return res.status(401).json({ message: "Xero token expired, please reconnect" });
      }
      
      const imported = await importContactsFromXero(xero, token.tenantId);
      
      await storage.createAuditLog({
        userId: req.session.userId,
        action: "create",
        entityType: "xero_import",
        afterJson: { imported: imported.length },
      });
      
      res.json({
        success: true,
        imported: imported.filter(i => i.isNew).length,
        skipped: imported.filter(i => !i.isNew).length,
        contacts: imported,
      });
    } catch (error) {
      console.error("Xero import contacts error:", error);
      res.status(500).json({ message: "Failed to import contacts from Xero" });
    }
  });

  // Sync invoice to Xero
  app.post("/api/xero/sync-invoice/:invoiceId", requireAdmin, async (req, res) => {
    try {
      const token = await getStoredToken();
      if (!token) {
        return res.status(400).json({ message: "Xero not connected" });
      }
      
      const invoice = await storage.getInvoice(req.params.invoiceId);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      const company = await storage.getCompany(invoice.companyId);
      if (!company) {
        return res.status(404).json({ message: "Company not found" });
      }
      
      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const redirectUri = `${protocol}://${host}/api/xero/callback`;
      
      const xero = createXeroClient(redirectUri);
      const refreshed = await refreshTokenIfNeeded(xero, token);
      
      if (!refreshed) {
        return res.status(401).json({ message: "Xero token expired, please reconnect" });
      }
      
      // Get invoice line items if available (simplified for now)
      const lineItems = [{
        description: `Invoice ${invoice.invoiceNumber}`,
        quantity: 1,
        unitAmount: parseFloat(invoice.subtotal as string),
      }];
      
      await syncInvoiceToXero(xero, token.tenantId, invoice, company, lineItems);
      
      await storage.createAuditLog({
        userId: req.session.userId,
        action: "update",
        entityType: "xero_sync",
        entityId: invoice.id,
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Xero sync invoice error:", error);
      res.status(500).json({ message: "Failed to sync invoice to Xero" });
    }
  });

  // ============ OUTLOOK EMAIL INTEGRATION ============
  
  // Get Outlook connection status
  app.get("/api/outlook/status", requireAuth, async (req, res) => {
    try {
      const token = await getStoredOutlookToken(req.session.userId!);
      if (token) {
        res.json({
          connected: true,
          email: token.emailAddress,
          expiresAt: token.expiresAt,
        });
      } else {
        res.json({ connected: false });
      }
    } catch (error) {
      console.error("Outlook status error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get Outlook OAuth authorization URL
  app.get("/api/outlook/auth-url", requireAuth, async (req, res) => {
    try {
      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const redirectUri = `${protocol}://${host}/api/outlook/callback`;
      
      const state = Math.random().toString(36).substring(2) + Date.now().toString(36);
      req.session.outlookState = state;
      
      const authUrl = await getOutlookAuthUrl(redirectUri, state);
      
      res.json({ url: authUrl });
    } catch (error) {
      console.error("Outlook auth URL error:", error);
      res.status(500).json({ message: "Failed to generate Outlook authorization URL" });
    }
  });

  // Handle Outlook OAuth callback
  app.get("/api/outlook/callback", async (req, res) => {
    try {
      const returnedState = req.query.state as string | undefined;
      const sessionState = req.session.outlookState;
      
      if (!returnedState || !sessionState || returnedState !== sessionState) {
        console.error("Outlook callback: state mismatch or missing session");
        return res.redirect("/admin?outlook=error&reason=invalid_state");
      }
      
      delete req.session.outlookState;
      
      if (!req.session.userId) {
        return res.redirect("/admin?outlook=error&reason=not_authenticated");
      }
      
      const code = req.query.code as string | undefined;
      if (!code) {
        const error = req.query.error as string;
        console.error("Outlook OAuth error:", error);
        return res.redirect(`/admin?outlook=error&reason=${encodeURIComponent(error || "no_code")}`);
      }
      
      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const redirectUri = `${protocol}://${host}/api/outlook/callback`;
      
      const tokens = await exchangeCodeForTokens(redirectUri, code);
      
      await saveOutlookToken(
        req.session.userId,
        tokens.accessToken,
        tokens.refreshToken,
        tokens.expiresAt,
        tokens.email
      );
      
      await storage.createAuditLog({
        userId: req.session.userId,
        action: "create",
        entityType: "outlook_connection",
        entityId: req.session.userId,
      });
      
      res.redirect("/admin?outlook=success");
    } catch (error) {
      console.error("Outlook callback error:", error);
      res.redirect("/admin?outlook=error&reason=token_exchange_failed");
    }
  });

  // Disconnect Outlook
  app.post("/api/outlook/disconnect", requireAuth, async (req, res) => {
    try {
      await deleteOutlookToken(req.session.userId!);
      res.json({ success: true });
    } catch (error) {
      console.error("Outlook disconnect error:", error);
      res.status(500).json({ message: "Failed to disconnect Outlook" });
    }
  });

  // Sync emails from Outlook
  app.post("/api/outlook/sync", requireAuth, async (req, res) => {
    try {
      const { folder = "inbox" } = req.body;
      
      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const redirectUri = `${protocol}://${host}/api/outlook/callback`;
      
      const accessToken = await refreshOutlookTokenIfNeeded(req.session.userId!, redirectUri);
      if (!accessToken) {
        return res.status(401).json({ message: "Outlook not connected or token expired" });
      }
      
      const synced = await syncEmailsToDatabase(req.session.userId!, accessToken, folder);
      
      res.json({ success: true, synced });
    } catch (error) {
      console.error("Outlook sync error:", error);
      res.status(500).json({ message: "Failed to sync emails from Outlook" });
    }
  });

  // Get emails
  app.get("/api/emails", requireAuth, async (req, res) => {
    try {
      const { folder, companyId, contactId, limit = "50" } = req.query;
      
      let emailList;
      if (companyId) {
        emailList = await getEmailsForCompany(companyId as string, parseInt(limit as string));
      } else if (contactId) {
        emailList = await getEmailsForContact(contactId as string, parseInt(limit as string));
      } else {
        emailList = await getAllEmails(req.session.userId!, folder as string | undefined, parseInt(limit as string));
      }
      
      res.json(emailList);
    } catch (error) {
      console.error("Get emails error:", error);
      res.status(500).json({ message: "Failed to get emails" });
    }
  });

  // Send email
  app.post("/api/outlook/send", requireAuth, async (req, res) => {
    try {
      const { to, subject, body, cc } = req.body;
      
      if (!to || !to.length || !subject || !body) {
        return res.status(400).json({ message: "Missing required fields: to, subject, body" });
      }
      
      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const redirectUri = `${protocol}://${host}/api/outlook/callback`;
      
      const accessToken = await refreshOutlookTokenIfNeeded(req.session.userId!, redirectUri);
      if (!accessToken) {
        return res.status(401).json({ message: "Outlook not connected or token expired" });
      }
      
      await sendEmail(accessToken, to, subject, body, cc);
      
      await storage.createAuditLog({
        userId: req.session.userId,
        action: "create",
        entityType: "email_sent",
        entityId: to[0],
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Send email error:", error);
      res.status(500).json({ message: "Failed to send email" });
    }
  });

  return httpServer;
}
