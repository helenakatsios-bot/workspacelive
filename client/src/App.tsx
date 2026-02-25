import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider } from "@/components/theme-provider";
import { AppSidebar } from "@/components/app-sidebar";
import { Loader2 } from "lucide-react";

import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import CompaniesPage from "@/pages/companies/index";
import CompanyDetailPage from "@/pages/companies/detail";
import CompanyFormPage from "@/pages/companies/form";
import ContactsPage from "@/pages/contacts/index";
import ContactDetailPage from "@/pages/contacts/detail";
import DealsPage from "@/pages/deals/index";
import DealFormPage from "@/pages/deals/form";
import DealDetailPage from "@/pages/deals/detail";
import ProductsPage from "@/pages/products/index";
import ProductFormPage from "@/pages/products/form";
import ProductDetailPage from "@/pages/products/detail";
import QuotesPage from "@/pages/quotes/index";
import QuoteFormPage from "@/pages/quotes/form";
import QuoteDetailPage from "@/pages/quotes/detail";
import OrdersPage from "@/pages/orders/index";
import OrderFormPage from "@/pages/orders/form";
import OrderDetailPage from "@/pages/orders/detail";
import InvoicesPage from "@/pages/invoices/index";
import NewInvoicePage from "@/pages/invoices/new";
import AdminPage from "@/pages/admin/index";
import PriceListsPage from "@/pages/admin/price-lists";
import ClientsSinceJuly2021Page from "@/pages/reports/clients-since-july-2021";
import ReportingDashboardsPage from "@/pages/reporting/dashboards";
import ReportingReportsPage from "@/pages/reporting/reports";
import ReportingGoalsPage from "@/pages/reporting/goals";
import SalesWorkspacePage from "@/pages/sales/workspace";
import SalesDocumentsPage from "@/pages/sales/documents";
import SalesActivityFeedPage from "@/pages/sales/activity-feed";
import SalesForecastPage from "@/pages/sales/forecast";
import SalesAnalyticsPage from "@/pages/sales/analytics";
import MarketingCampaignsPage from "@/pages/marketing/campaigns";
import MarketingEmailPage from "@/pages/marketing/email";
import MarketingFormsPage from "@/pages/marketing/forms";
import MarketingAnalyticsPage from "@/pages/marketing/analytics";
import CommerceHubPage from "@/pages/commerce/hub";
import ServiceHubPage from "@/pages/service/hub";
import CustomerSuccessPage from "@/pages/service/customer-success";
import CustomerAgentPage from "@/pages/service/customer-agent";
import ChatflowsPage from "@/pages/service/chatflows";
import KnowledgeBasePage from "@/pages/service/knowledge-base";
import CustomerPortalPage from "@/pages/service/customer-portal";
import ServiceAnalyticsPage from "@/pages/service/service-analytics";
import DataAgentPage from "@/pages/data-management/data-agent";
import DataIntegrationPage from "@/pages/data-management/data-integration";
import EventManagementPage from "@/pages/data-management/event-management";
import DataQualityPage from "@/pages/data-management/data-quality";
import DataStudioPage from "@/pages/data-management/data-studio";
import DataModelPage from "@/pages/data-management/data-model";
import DataEnrichmentPage from "@/pages/data-management/data-enrichment";
import TicketsPage from "@/pages/crm/tickets";
import ProjectsPage from "@/pages/crm/projects";
import SegmentsPage from "@/pages/crm/segments";
import InboxPage from "@/pages/crm/inbox";
import CallsPage from "@/pages/crm/calls";
import TasksPage from "@/pages/crm/tasks";
import PlaybooksPage from "@/pages/crm/playbooks";
import MessageTemplatesPage from "@/pages/crm/message-templates";
import SnippetsPage from "@/pages/crm/snippets";
import OrderRequestsPage from "@/pages/orders/requests";
import EmailsPage from "@/pages/emails/index";
import PublicOrderFormPage from "@/pages/public/order-form";
import PublicFormPage from "@/pages/public/form";
import CustomerPortalApp from "@/pages/portal/index";
import NotFound from "@/pages/not-found";

function AppLayout({ children }: { children: React.ReactNode }) {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center gap-2 p-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
          </header>
          <main className="flex-1 overflow-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function AuthenticatedApp() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/companies" component={CompaniesPage} />
        <Route path="/companies/new" component={CompanyFormPage} />
        <Route path="/companies/:id" component={CompanyDetailPage} />
        <Route path="/companies/:id/edit" component={CompanyFormPage} />
        <Route path="/contacts" component={ContactsPage} />
        <Route path="/contacts/:id" component={ContactDetailPage} />
        <Route path="/deals" component={DealsPage} />
        <Route path="/deals/new" component={DealFormPage} />
        <Route path="/deals/:id" component={DealDetailPage} />
        <Route path="/deals/:id/edit" component={DealFormPage} />
        <Route path="/products" component={ProductsPage} />
        <Route path="/products/new" component={ProductFormPage} />
        <Route path="/products/:id" component={ProductDetailPage} />
        <Route path="/products/:id/edit" component={ProductFormPage} />
        <Route path="/quotes" component={QuotesPage} />
        <Route path="/quotes/new" component={QuoteFormPage} />
        <Route path="/quotes/:id" component={QuoteDetailPage} />
        <Route path="/quotes/:id/edit" component={QuoteFormPage} />
        <Route path="/orders" component={OrdersPage} />
        <Route path="/orders/new" component={OrderFormPage} />
        <Route path="/orders/requests" component={OrderRequestsPage} />
        <Route path="/emails" component={EmailsPage} />
        <Route path="/orders/:id" component={OrderDetailPage} />
        <Route path="/orders/:id/edit" component={OrderDetailPage} />
        <Route path="/invoices" component={InvoicesPage} />
        <Route path="/invoices/new" component={NewInvoicePage} />
        <Route path="/invoices/:id" component={InvoicesPage} />
        <Route path="/crm/tickets" component={TicketsPage} />
        <Route path="/crm/projects" component={ProjectsPage} />
        <Route path="/crm/segments" component={SegmentsPage} />
        <Route path="/crm/inbox" component={InboxPage} />
        <Route path="/crm/calls" component={CallsPage} />
        <Route path="/crm/tasks" component={TasksPage} />
        <Route path="/crm/playbooks" component={PlaybooksPage} />
        <Route path="/crm/message-templates" component={MessageTemplatesPage} />
        <Route path="/crm/snippets" component={SnippetsPage} />
        <Route path="/sales/workspace" component={SalesWorkspacePage} />
        <Route path="/sales/documents" component={SalesDocumentsPage} />
        <Route path="/sales/activity-feed" component={SalesActivityFeedPage} />
        <Route path="/sales/forecast" component={SalesForecastPage} />
        <Route path="/sales/analytics" component={SalesAnalyticsPage} />
        <Route path="/marketing/campaigns" component={MarketingCampaignsPage} />
        <Route path="/marketing/email" component={MarketingEmailPage} />
        <Route path="/marketing/forms" component={MarketingFormsPage} />
        <Route path="/marketing/analytics" component={MarketingAnalyticsPage} />
        <Route path="/commerce/hub" component={CommerceHubPage} />
        <Route path="/service" component={ServiceHubPage} />
        <Route path="/service/customer-success" component={CustomerSuccessPage} />
        <Route path="/service/customer-agent" component={CustomerAgentPage} />
        <Route path="/service/chatflows" component={ChatflowsPage} />
        <Route path="/service/knowledge-base" component={KnowledgeBasePage} />
        <Route path="/service/customer-portal" component={CustomerPortalPage} />
        <Route path="/service/analytics" component={ServiceAnalyticsPage} />
        <Route path="/data-management/data-agent" component={DataAgentPage} />
        <Route path="/data-management/data-integration" component={DataIntegrationPage} />
        <Route path="/data-management/event-management" component={EventManagementPage} />
        <Route path="/data-management/data-quality" component={DataQualityPage} />
        <Route path="/data-management/data-studio" component={DataStudioPage} />
        <Route path="/data-management/data-model" component={DataModelPage} />
        <Route path="/data-management/data-enrichment" component={DataEnrichmentPage} />
        <Route path="/reporting/dashboards" component={ReportingDashboardsPage} />
        <Route path="/reporting/reports" component={ReportingReportsPage} />
        <Route path="/reporting/goals" component={ReportingGoalsPage} />
        <Route path="/reports/clients-since-july-2021" component={ClientsSinceJuly2021Page} />
        <Route path="/admin" component={AdminPage} />
        <Route path="/admin/price-lists" component={PriceListsPage} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function AppRouter() {
  const [location] = useLocation();

  if (location === "/order" || location.startsWith("/order?")) {
    return <PublicOrderFormPage />;
  }

  if (location.startsWith("/form/")) {
    const formId = location.replace("/form/", "").split("?")[0];
    return <PublicFormPage formId={formId} />;
  }

  if (location === "/portal" || location.startsWith("/portal/") || location.startsWith("/portal?")) {
    return <CustomerPortalApp />;
  }

  return <AuthenticatedApp />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <AppRouter />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
