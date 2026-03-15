# Business CRM - Order Management System

## Overview

A professional B2B CRM and order management system designed for wholesale manufacturing businesses. The application provides comprehensive functionality for managing companies, contacts, deals, products, quotes, orders, and invoices with role-based access control. Key capabilities include advanced reporting, sales and marketing sections, a HubSpot-style company profile, client grading, customer-specific and variant pricing, and an AI assistant named "Millie." It also features a public customer order form, PDF attachment order extraction, a customer portal, and an email-to-order webhook to streamline operations. The project aims to provide a robust, beginner-safe UI that prevents data corruption and enhances efficiency for wholesale manufacturing businesses.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
- **Layout**: 3-column HubSpot-style company profile.
- **Grading System**: Automatic A/B/C client grading based on order revenue with manual override.
- **PDF Generation**: Professional order PDFs generated using PDFKit.
- **Beginner-Safe UI**: Opinionated interface designed to guide users and prevent data corruption.
- **Theming**: Light/dark mode support with custom CSS variables.
- **Reporting**: Collapsible sidebar sections for Dashboards, Reports, Goals, and specific client reports.
- **Sales & Marketing**: Collapsible sidebar sections for various sales and marketing tools.

### Technical Implementations
- **Frontend**: React with TypeScript, Vite, Wouter for routing, TanStack React Query for state, shadcn/ui for components, Tailwind CSS for styling, and React Hook Form with Zod for form handling.
- **Backend**: Express.js with TypeScript, RESTful API, session-based authentication with bcrypt, and role-based access control middleware.
- **Data Layer**: PostgreSQL database, Drizzle ORM with drizzle-zod for schema validation, and Drizzle Kit for migrations.
- **AI Assistant**: "Ask Millie" uses OpenAI via Replit AI Integrations for internal chat support, with per-user conversation scoping.
- **Customer Success**: Tracks ordering patterns and identifies inactive customers based on predefined thresholds, with automated alerts.
- **Public Customer Order Form**: Allows customers to browse products and submit orders without login, with admin configuration for notifications.
- **PDF Order Extraction**: Uses pdfjs-dist and OpenAI (gpt-4o-mini, vision API) to extract order data from email PDF attachments, supporting both text-based and scanned PDFs.
- **Customer Portal**: A B2B customer-facing portal for viewing orders, invoices, and company information, with separate session authentication.
- **Recurring Orders**: Per-company recurring order templates stored as JSONB in `portal_users.recurring_items`. Admins configure the template from the company detail page (copy from an existing order). Portal users see a "Recurring" tab (only when a template is configured) with pre-filled quantities they can adjust before placing.
- **Portal Password Convention**: All portal users use password `admin123`. The startup migration (`runStartupTasks` in `server/index.ts`) verifies this on every restart and resets all portal passwords if they don't match. Admin CRM password is also `admin123`.
- **Email-to-Order Webhook**: A public, secret-authenticated webhook for forwarding email content to create order requests, designed for Power Automate integration.

### Feature Specifications
- **Reporting Section**: Dashboards, categorized reports, revenue/order tracking goals, "Clients Since July 2021" report with CSV export.
- **Sales Section**: Sales Workspace, Documents, Activity Feed, Forecast, Sales Analytics.
- **Marketing Section**: Campaigns, Email, Forms, Marketing Analytics.
- **Customer-Specific Pricing**: Per-company product pricing managed via company profiles, applied automatically to portal orders.
- **Variant Pricing**: Per-company pricing by product filling and weight options, dynamically updated in the portal.
- **Price Lists**: Multiple named price lists (Standard, Interiors, Trade, etc.) with dropdown selector on product detail pages. Admin management at /admin/price-lists. Uses price_lists and price_list_prices tables.
- **Contact Import**: Automated contact import from HubSpot CSV, matching by email domain and name.
- **Date-Based Order Filtering**: Powerful date range filtering with presets on the Orders page.
- **Role-Based Access Control**: Four roles (Admin, Office/Sales, Warehouse, Read-only) with distinct permissions.
- **Audit Logging**: Logs all create/update operations.

## External Dependencies

### Database
- **PostgreSQL**: Primary database.
- **connect-pg-simple**: PostgreSQL session storage.

### UI Libraries
- **Radix UI**: Headless component primitives.
- **Tailwind CSS**: Utility-first CSS framework.
- **Lucide React**: Icon library.
- **date-fns**: Date manipulation utilities.

### Development Tools
- **Vite**: Frontend build tool.
- **esbuild**: Server bundling.
- **Drizzle Kit**: Database migration tooling.
- **TypeScript**: Language.

### Replit-Specific
- **@replit/vite-plugin-runtime-error-modal**: Development error modal.
- **@replit/vite-plugin-cartographer**: Replit development tooling.
- **@replit/vite-plugin-dev-banner**: Development banner.
- **OpenAI via Replit AI Integrations**: For "Ask Millie" and PDF extraction.

### Integrations
- **Xero Accounting**: Contact import and invoice synchronization (ready to connect).
- **Outlook Email**: OAuth 2.0 authentication, email sync, sending, threading replies, and creating orders from emails using Microsoft Graph API.
- **Purax Feather Holdings App**: Integrates for pushing CRM orders to the Purax app for further processing and Xero invoice creation, sending order PDFs via multipart/form-data.
- **Shopify**: Two-way integration — Shopify orders are automatically imported into the CRM via HMAC-verified webhook (`/api/webhooks/shopify/orders/created`), and CRM orders can be fulfilled back in Shopify via the Fulfillments API. Config stored in `crm_settings` table. Orders table has `shopifyOrderId`, `shopifyOrderNumber`, `shopifyFulfillmentId` columns.