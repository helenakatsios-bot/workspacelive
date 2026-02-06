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
- **Date-Based Order Filtering**: Orders page includes powerful date range filtering with preset options including "Since July 2021"
- **Role-Based Access Control**: Four user roles with different permissions:
  - **Admin**: Full access to all features including user management and settings
  - **Office/Sales**: Can view and edit all data, manage orders and customers
  - **Warehouse**: Can view orders and update order status, limited pricing visibility
  - **Read-only**: View-only access to all data
- **Audit Logging**: All create/update operations are logged for compliance and accountability
- **Beginner-Safe UI**: Professional, opinionated interface that guides users and prevents data corruption
- **Public Customer Order Form**: Shareable link (/order) that customers can use to browse the product catalogue, select items, and submit orders directly. Orders appear in the CRM for review. Email notifications via Outlook when configured.
  - **Public URL**: /order (no login required)
  - **Admin Settings**: Admin → Order Form tab shows the shareable link, notification email config, and incoming order requests
  - **Database Tables**: customer_order_requests, crm_settings
  - **API Routes**: GET /api/public/products (public), POST /api/public/order-request (public), GET/PATCH /api/customer-order-requests (auth required), GET/PUT /api/settings/:key (auth required)

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
- **Features**: OAuth 2.0 authentication, email sync, send emails from CRM
- **Location**: Admin → Integrations tab
- **API Routes**:
  - `GET /api/outlook/status` - Check connection status
  - `GET /api/outlook/auth-url` - Get OAuth authorization URL
  - `GET /api/outlook/callback` - OAuth callback handler
  - `POST /api/outlook/disconnect` - Disconnect Outlook
  - `POST /api/outlook/sync` - Sync emails from Outlook
  - `GET /api/emails` - Get synced emails
  - `POST /api/outlook/send` - Send email via Outlook
- **Database Tables**:
  - `outlook_tokens` - Stores OAuth tokens per user
  - `emails` - Cached emails synced from Outlook
- **Dependencies**: @azure/msal-node, @microsoft/microsoft-graph-client
- **Environment Variables**: OUTLOOK_CLIENT_ID, OUTLOOK_CLIENT_SECRET

### Purax Feather Holdings App
- **Status**: Configured
- **Flow**: CRM Order → Purax App → Xero
- **Features**: Push orders from CRM to the Purax order management app, which handles Xero invoice creation
- **Location**: Admin → Integrations tab
- **API Routes**:
  - `POST /api/orders/:id/sync-purax` - Send order to Purax app
- **Schema Fields on Orders**:
  - `purax_sync_status` - not_sent, sent, failed
  - `purax_synced_at` - Timestamp of last sync
  - `purax_order_id` - ID returned from Purax app
- **Environment Variables**: PURAX_API_URL (set to https://order-manager-pro.replit.app)
- **Webhook Endpoint Required on Purax App**: `POST /api/webhook/crm-order`
- **Note**: The Purax app needs to implement a webhook receiver at `/api/webhook/crm-order` that accepts the order payload from this CRM