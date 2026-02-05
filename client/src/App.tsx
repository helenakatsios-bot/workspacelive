import { Switch, Route } from "wouter";
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
import DealsPage from "@/pages/deals/index";
import ProductsPage from "@/pages/products/index";
import QuotesPage from "@/pages/quotes/index";
import OrdersPage from "@/pages/orders/index";
import OrderDetailPage from "@/pages/orders/detail";
import InvoicesPage from "@/pages/invoices/index";
import AdminPage from "@/pages/admin/index";
import ClientsSinceJuly2021Page from "@/pages/reports/clients-since-july-2021";
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
        <Route path="/contacts/new" component={CompanyFormPage} />
        <Route path="/contacts/:id" component={CompanyDetailPage} />
        <Route path="/deals" component={DealsPage} />
        <Route path="/deals/new" component={DealsPage} />
        <Route path="/deals/:id" component={DealsPage} />
        <Route path="/products" component={ProductsPage} />
        <Route path="/products/new" component={ProductsPage} />
        <Route path="/products/:id" component={ProductsPage} />
        <Route path="/quotes" component={QuotesPage} />
        <Route path="/quotes/new" component={QuotesPage} />
        <Route path="/quotes/:id" component={QuotesPage} />
        <Route path="/orders" component={OrdersPage} />
        <Route path="/orders/new" component={OrdersPage} />
        <Route path="/orders/:id" component={OrderDetailPage} />
        <Route path="/orders/:id/edit" component={OrderDetailPage} />
        <Route path="/invoices" component={InvoicesPage} />
        <Route path="/invoices/new" component={InvoicesPage} />
        <Route path="/invoices/:id" component={InvoicesPage} />
        <Route path="/reports/clients-since-july-2021" component={ClientsSinceJuly2021Page} />
        <Route path="/admin" component={AdminPage} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <AuthenticatedApp />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
