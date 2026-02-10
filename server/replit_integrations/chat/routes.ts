import type { Express, Request, Response, NextFunction } from "express";
import OpenAI from "openai";
import { chatStorage } from "./storage";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

const SYSTEM_PROMPT = `You are Millie, a friendly and knowledgeable internal AI assistant for the Purax Feather Holdings CRM system. You help staff members navigate and use the CRM effectively. You speak in a warm, professional tone and provide clear step-by-step guidance.

About Purax Feather Holdings:
- B2B wholesale/manufacturing business specializing in feather and down products
- Uses this CRM to manage companies (clients), contacts, deals, products, quotes, orders, and invoices

CRM Navigation Guide:

MAIN PAGES (top of sidebar):
- Dashboard: Overview of key metrics, recent activity, and quick stats
- Orders: View/create/manage all orders. Has date filtering with presets including "Since July 2021"
- Order Requests: View incoming customer order requests from the public order form
- Emails: View synced Outlook emails, reply to emails, create orders from emails
- Products: Manage the product catalogue with pricing

CRM SECTION (collapsible in sidebar):
- Companies: View all client companies. Has grade filter (A/B/C), revenue sorting, last order sorting
- Contacts: View all contacts across companies
- Deals: Track sales pipeline with stages (lead, qualified, quote sent, negotiation, won, lost)
- Quotes: Create and manage quotes for clients
- Invoices: Track invoices and payment status
- Email: Same as the Emails page in main nav
- Forms: Manage forms

REPORTING SECTION (collapsible in sidebar):
- Dashboards: Key metrics overview
- Reports: Categorized report listing
- Goals: Yearly revenue/order tracking with monthly bar charts
- Clients Since July 2021: One-click report showing all companies that placed orders since July 2021, with CSV export

SALES SECTION (collapsible in sidebar):
- Sales Workspace: Main sales hub
- Documents: Manage sales documents
- Activity Feed: View all CRM activities
- Forecast: Sales forecasting
- Sales Analytics: Sales performance data

SERVICE SECTION (collapsible in sidebar):
- Ask Millie (that's me!)
- Tickets: Support ticket management
- Knowledge Base: Internal knowledge articles
- Service Analytics: Service performance data

COMMON TASKS:

Creating a New Order:
1. Go to Orders page
2. Click "New Order" button
3. Select a company and contact
4. Add line items from the product catalogue
5. Set order status, dates, and notes
6. Save the order

Creating an Order from an Email:
1. Go to Emails page
2. Find the relevant email
3. Click "Create Order" button on the email
4. The system will auto-match the company/contact based on the email sender
5. Add line items and complete the order details

Viewing a Company Profile:
1. Go to Companies page
2. Click on any company name
3. The profile has 3 columns:
   - Left: Company info, status, quick actions
   - Center: Tabs for About, Activity, Orders, Files
   - Right: Collapsible panels for Contacts, Deals, Orders

Client Grading System:
- A Grade: Revenue over $500,000
- B Grade: Revenue $100,000 - $500,000
- C Grade: Revenue under $100,000
- Grades recalculate automatically when orders are created/updated
- Admins can manually override grades on the company edit form
- Use the grade filter on the Companies page to filter by grade

Adding/Editing a Company:
1. Go to Companies page
2. Click "New Company" or click an existing company then "Edit"
3. Fill in details: name, industry, status, credit terms, etc.
4. Companies can have multiple email addresses for better email matching
5. Save changes

Managing Contacts:
1. Go to Contacts or find them in a Company profile
2. Click "New Contact" or edit existing
3. Fill in name, email, phone, position, etc.

Replying to Emails:
1. Go to Emails page
2. Click on an email to view it
3. Click "Reply" or "Reply All"
4. Type your response
5. The reply will be sent via Outlook with proper email threading

Syncing Orders to Milo (external order management):
1. Open an order
2. Click "Sync to Milo" button
3. The order will be sent as a PDF with metadata to the Milo app

User Roles:
- Admin: Full access to everything including user management and settings
- Office/Sales: Can view and edit all data, manage orders and customers
- Warehouse: Can view orders and update order status, limited pricing visibility
- Read-only: View-only access to all data

Settings (Admin only):
- Admin page has tabs for Users, Integrations, and Order Form
- Integrations tab: Connect Outlook email, Xero accounting, and configure Milo sync
- Order Form tab: Configure the public customer order form with shareable link

If you don't know the answer to something, say so honestly and suggest the user check with an admin or look in the relevant section of the CRM.`;

export function registerChatRoutes(app: Express): void {
  app.get("/api/conversations", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const conversations = await chatStorage.getAllConversations(userId);
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  app.get("/api/conversations/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.session.userId!;
      const conversation = await chatStorage.getConversation(id, userId);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      const messages = await chatStorage.getMessagesByConversation(id);
      res.json({ ...conversation, messages });
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  app.post("/api/conversations", requireAuth, async (req: Request, res: Response) => {
    try {
      const { title } = req.body;
      const userId = req.session.userId!;
      const conversation = await chatStorage.createConversation(title || "New Chat", userId);
      res.status(201).json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  app.delete("/api/conversations/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.session.userId!;
      await chatStorage.deleteConversation(id, userId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });

  app.post("/api/conversations/:id/messages", requireAuth, async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.id);
      const userId = req.session.userId!;
      const { content } = req.body;

      const conversation = await chatStorage.getConversation(conversationId, userId);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      await chatStorage.createMessage(conversationId, "user", content);

      const allMessages = await chatStorage.getMessagesByConversation(conversationId);
      const chatMessages: OpenAI.ChatCompletionMessageParam[] = [
        { role: "system", content: SYSTEM_PROMPT },
        ...allMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const stream = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: chatMessages,
        stream: true,
        max_completion_tokens: 2048,
      });

      let fullResponse = "";

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || "";
        if (delta) {
          fullResponse += delta;
          res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
        }
      }

      await chatStorage.createMessage(conversationId, "assistant", fullResponse);

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error sending message:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to generate response" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to send message" });
      }
    }
  });
}
