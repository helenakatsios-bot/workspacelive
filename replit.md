# Business CRM - Order Management System

## Overview

A professional B2B CRM and order management system designed for wholesale manufacturing businesses. The application provides comprehensive functionality for managing companies, contacts, deals, products, quotes, orders, and invoices with role-based access control.

## Key Features

### Critical Business Requirements
- **Reporting Section**: Collapsible sidebar section with Dashboards (key metrics, order status, deal pipeline), Reports (categorized report listing), Goals (yearly revenue/order tracking with monthly bar charts), and Clients Since July 2021 report
- **Sales Section**: Collapsible sidebar section with Sales Workspace, Documents, Activity Feed, Forecast, and Sales Analytics pages
- **Marketing Section**: Collapsible sidebar section with Campaigns, Email, Forms, and Marketing Analytics pages
- **"Clients Since July 2021" Report**: One-click access to all companies that have placed orders from July 1, 2021 to today. Located in the Reporting section of the sidebar with CSV export capability.
- **HubSpot-style Company Profile**: 3-column layout - left panel (company info, status, quick actions), center panel (About/Activity/Orders/Files tabs), right panel (collapsible Contacts/Deals/Orders panels)
- **Client Grading System**: Automatic A/B/C grading based on order revenue (A: >$500K, B: $100K-$500K, C: <$100K). Companies page has grade filter, revenue sorting, and last order sorting. Revenue recalculates automatically on order create/update. Admin "Recalculate" button for bulk recalculation. Grade can be manually overridden on company edit form.
- **Customer-Specific Pricing**: Per-company product pricing. Set custom prices on the company profile "Pricing" tab. Portal customers see their company-specific prices when ordering. Orders created via portal use company-specific prices automatically.
  - **Database Tables**: company_prices (id, companyId, productId, unitPrice, updatedAt)
  - **API Routes**: GET /api/companies/:id/prices, PUT /api/companies/:id/prices (body: {productId, unitPrice}), DELETE /api/companies/:id/prices/:productId
  - **Portal Integration**: Portal products endpoint overlays company-specific prices; portal order creation uses company-specific prices
- **Contact Import**: 399 contacts imported from HubSpot CSV export, matched to existing companies by email domain and name. Import script at server/import-contacts.ts.
- **Date-Based Order Filtering**: Orders page includes powerful date range filtering with preset options including "Since July 2021"
- **Role-Based Access Control**: Four user roles with different permissions:
  - **Admin**: Full access to all features including user management and settings
  - **Office/Sales**: Can view and edit all data, manage orders and customers
  - **Warehouse**: Can view orders and update order status, limited pricing visibility
  - **Read-only**: View-only access to all data
- **Audit Logging**: All create/update operations are logged for compliance and accountability
- **Beginner-Safe UI**: Professional, opinionated interface that guides users and prevents data corruption
- **Ask Millie (AI Assistant)**: Internal AI chat assistant named "Millie" that helps staff navigate and use the CRM. Located in Service > Ask Millie. Uses OpenAI via Replit AI Integrations. Conversations are scoped per-user for privacy. Streams responses via SSE. Database tables: conversations (with user_id), messages.
- **Customer Success**: Tracks ordering patterns and identifies inactive customers. Located in Service > Customer Success. Shows Healthy/At Risk/Inactive status based on days since last order (30/60 day thresholds). Displays avg order gap, total orders, revenue. "Send 60-Day Alert" button emails helena@purax.com.au and michele@purax.com.au. Automated daily inactivity checker runs every 24 hours and sends alerts automatically when Outlook is connected.
  - **API Routes**: GET /api/customer-success/metrics, GET /api/customer-success/inactive?days=60, POST /api/customer-success/send-inactivity-alert (admin only)
  - **Automated Checker**: server/inactivity-checker.ts - runs daily, sends email via Outlook if customers are 60+ days inactive
- **Public Customer Order Form**: Shareable link (/order) that customers can use to browse the product catalogue, select items, and submit orders directly. Orders appear in the CRM for review. Email notifications via Outlook when configured.
  - **Public URL**: /order (no login required)
  - **Admin Settings**: Admin → Order Form tab shows the shareable link, notification email config, and incoming order requests
  - **Database Tables**: customer_order_requests, crm_settings
  - **API Routes**: GET /api/public/products (public), POST /api/public/order-request (public), GET/PATCH /api/customer-order-requests (auth required), GET/PUT /api/settings/:key (auth required)
- **PDF Attachment Order Extraction**: Extract order data from PDF attachments on emails. When viewing an email, PDF attachments are displayed with a "Create Order" button. Uses pdfjs-dist for text extraction and OpenAI (gpt-4o-mini) to parse order details (company, contact, line items, prices). For scanned/image-based PDFs, uses pdftoppm (poppler-utils) to convert pages to images and OpenAI vision API for OCR. Shows editable review screen before creating the order.
  - **API Routes**: GET /api/emails/:id/attachments (list PDFs), POST /api/emails/:id/extract-pdf-order (AI extraction), POST /api/emails/:id/create-order-from-pdf (create order)
  - **Dependencies**: pdfjs-dist, OpenAI via Replit AI Integrations
  - **Location**: Marketing > Email > click email > PDF Attachments section
- **Customer Portal**: B2B customer-facing portal where customers can log in to view their orders, invoices, and company info. Managed via Admin → Portal tab.
  - **Portal URL**: /portal (separate session auth from staff)
  - **Admin Management**: Admin → Portal tab shows portal URL (copy/open), portal user list with create/toggle active/delete
  - **Database Tables**: portal_users (id, name, email, passwordHash, companyId, active, lastLogin, createdAt)
  - **API Routes**: POST /api/portal/auth/login, GET /api/portal/auth/me, POST /api/portal/auth/logout, GET /api/portal/dashboard, GET /api/portal/orders, GET /api/portal/invoices, GET /api/portal/products, POST /api/portal/orders (new order), PATCH /api/portal/account (update password)
  - **Admin API**: GET /api/admin/portal-users, POST /api/admin/portal-users, PATCH /api/admin/portal-users/:id, DELETE /api/admin/portal-users/:id
  - **Session Keys**: portalUserId, portalCompanyId (separate from staff session)
- **Email-to-Order Webhook**: Public webhook endpoint that accepts forwarded email content and creates order requests. Designed for use with Power Automate to forward Outlook order emails directly into the CRM.
  - **Webhook URL**: POST /api/public/email-order-webhook (public, secret-auth)
  - **Auth**: X-Webhook-Secret header with stored secret
  - **Rate Limited**: 30 requests per minute per IP
  - **Admin Settings**: Admin → Order Form tab shows webhook URL, secret (with show/hide/copy), Power Automate setup instructions, and regenerate button
  - **API Routes**: POST /api/public/email-order-webhook (public), POST /api/settings/generate-webhook-secret (admin)
  - **CRM Settings Key**: email_order_webhook_secret

### Demo Login Credentials
- Admin: admin@company.com / admin123
- Office: office@company.com / office123
- Warehouse: warehouse@company.com / warehouse123
- Read-only: viewer@company.com / viewer123

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack React Query for server state management and caching
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom CSS variables for theming (light/dark mode support)
- **Form Handling**: React Hook Form with Zod validation via @hookform/resolvers

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **API Design**: RESTful API endpoints under `/api` prefix
- **Session Management**: express-session with connect-pg-simple for PostgreSQL session storage
- **Authentication**: Session-based authentication with bcrypt for password hashing
- **Role-Based Access Control**: Four user roles (admin, office, warehouse, readonly) with middleware enforcement

### Data Layer
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM with drizzle-zod for schema validation
- **Schema Location**: `shared/schema.ts` contains all table definitions and Zod schemas
- **Migrations**: Drizzle Kit for database migrations (output to `./migrations`)

### Project Structure
```
├── client/           # React frontend application
│   └── src/
│       ├── components/   # Reusable UI components
│       ├── pages/        # Route page components
│       ├── hooks/        # Custom React hooks
│       └── lib/          # Utilities, auth context, query client
├── server/           # Express backend
│   ├── index.ts      # Server entry point
│   ├── routes.ts     # API route definitions
│   ├── storage.ts    # Database access layer
│   ├── db.ts         # Database connection
│   └── seed.ts       # Database seeding
├── shared/           # Shared code between frontend and backend
│   └── schema.ts     # Drizzle schema and Zod validation
└── migrations/       # Database migration files
```

### Build System
- **Development**: Vite dev server with HMR, proxied through Express
- **Production**: Vite builds client to `dist/public`, esbuild bundles server to `dist/index.cjs`
- **Scripts**: `npm run dev` for development, `npm run build` for production, `npm run db:push` for schema sync

### Authentication Flow
1. Users authenticate via `/api/auth/login` with email/password
2. Sessions stored in PostgreSQL using connect-pg-simple
3. Protected routes use `requireAuth`, `requireAdmin`, and `requireEdit` middleware
4. User context provided via React Context (`useAuth` hook)

## External Dependencies

### Database
- **PostgreSQL**: Primary database accessed via `DATABASE_URL` environment variable
- **connect-pg-simple**: Session storage in PostgreSQL

### UI Libraries
- **Radix UI**: Headless component primitives (dialog, dropdown, tabs, etc.)
- **Tailwind CSS**: Utility-first CSS framework
- **Lucide React**: Icon library
- **date-fns**: Date manipulation utilities

### Development Tools
- **Vite**: Frontend build tool with React plugin
- **esbuild**: Server bundling for production
- **Drizzle Kit**: Database migration tooling
- **TypeScript**: Type checking across the entire codebase

### Replit-Specific
- **@replit/vite-plugin-runtime-error-modal**: Error overlay in development
- **@replit/vite-plugin-cartographer**: Development tooling for Replit
- **@replit/vite-plugin-dev-banner**: Development banner display

## Integrations

### Xero Accounting
- **Status**: Ready to connect
- **Features**: Contact import, invoice sync
- **Location**: Admin → Integrations tab

### Outlook Email
- **Status**: Ready to connect
- **Features**: OAuth 2.0 authentication, email sync, send emails from CRM, reply to emails with threading, create orders from emails
- **Location**: Admin → Integrations tab
- **API Routes**:
  - `GET /api/outlook/status` - Check connection status
  - `GET /api/outlook/auth-url` - Get OAuth authorization URL
  - `GET /api/outlook/callback` - OAuth callback handler
  - `POST /api/outlook/disconnect` - Disconnect Outlook
  - `POST /api/outlook/sync` - Sync emails from Outlook
  - `GET /api/emails` - Get synced emails
  - `POST /api/outlook/send` - Send email via Outlook
  - `POST /api/emails/:id/reply` - Reply to email with threading (body, replyAll)
  - `GET /api/emails/:id` - Get single email by ID
- **Database Tables**:
  - `outlook_tokens` - Stores OAuth tokens per user
  - `emails` - Cached emails synced from Outlook
- **Dependencies**: @azure/msal-node, @microsoft/microsoft-graph-client
- **Environment Variables**: OUTLOOK_CLIENT_ID, OUTLOOK_CLIENT_SECRET

### Purax Feather Holdings App
- **Status**: Configured
- **Flow**: CRM Order → Purax App → Xero
- **Features**: Push orders from CRM to the Purax order management app, which handles Xero invoice creation
- **PDF Sync**: Orders are sent as multipart/form-data with a generated PDF attachment (field: "orderPdf") and JSON metadata (field: "metadata"). The PDF includes company info, contact, line items, totals, and notes.
- **Order PDF Download**: GET `/api/orders/:id/pdf` generates and downloads an order as a PDF from within the CRM
- **Location**: Admin → Integrations tab
- **API Routes**:
  - `POST /api/orders/:id/sync-purax` - Send order to Purax app (multipart with PDF)
  - `GET /api/orders/:id/pdf` - Download order as PDF
- **Schema Fields on Orders**:
  - `purax_sync_status` - not_sent, sent, failed
  - `purax_synced_at` - Timestamp of last sync
  - `purax_order_id` - ID returned from Purax app
- **Environment Variables**: PURAX_API_URL (set to https://order-manager-pro.replit.app)
- **Webhook Endpoint Required on Purax App**: `POST /api/webhook/crm-order`
- **Note**: The Purax app needs to implement a webhook receiver at `/api/webhook/crm-order` that accepts multipart/form-data with "metadata" (JSON) and "orderPdf" (PDF file) fields
- **PDF Generation**: Uses PDFKit (server/pdf.ts) to generate professional order PDFs