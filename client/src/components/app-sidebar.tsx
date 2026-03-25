import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  Users,
  Target,
  FileText,
  Package,
  Receipt,
  LayoutDashboard,
  Settings,
  ShoppingCart,
  Moon,
  Sun,
  BarChart3,
  ChevronDown,
  Briefcase,
  FolderOpen,
  Activity,
  TrendingUp,
  Mail,
  ClipboardList,
  BarChart2,
  Store,
  Headphones,
  Sparkles,
  Plug,
  CalendarCheck,
  Brain,
  Warehouse,
  ShieldCheck,
  Blocks,
  Database,
  Ticket,
  FolderKanban,
  ListFilter,
  Inbox,
  Phone,
  CheckSquare,
  BookOpen,
  MessageSquareText,
  TextSelect,
  Contact,
  Award,
  Bot,
  MessageCircle,
  BookOpenCheck,
  Globe,
  ClipboardCheck,
  AlertTriangle,
  Megaphone,
  LogOut,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/components/theme-provider";

// CRM — core items only
const crmItems = [
  { title: "Companies", url: "/companies", icon: Building2 },
  { title: "Intelligence Hub", url: "/intelligence", icon: Brain },
  { title: "Supplier Order List", url: "/production-list", icon: ClipboardList },
  { title: "Orders", url: "/orders", icon: ShoppingCart },
  { title: "Goals", url: "/reporting/goals", icon: Target },
];

// Sales
const salesItems = [
  { title: "Deals", url: "/deals", icon: Target },
  { title: "Sales Workspace", url: "/sales/workspace", icon: Briefcase },
  { title: "Activity Feed", url: "/sales/activity-feed", icon: Activity },
  { title: "Forecast", url: "/sales/forecast", icon: TrendingUp },
  { title: "Calls", url: "/crm/calls", icon: Phone },
  { title: "Tasks", url: "/crm/tasks", icon: CheckSquare },
  { title: "Playbooks", url: "/crm/playbooks", icon: BookOpen },
  { title: "Documents", url: "/sales/documents", icon: FolderOpen },
  { title: "Sales Analytics", url: "/sales/analytics", icon: BarChart2 },
];

// Marketing
const marketingItems = [
  { title: "Email", url: "/marketing/email", icon: Mail },
  { title: "Forms", url: "/marketing/forms", icon: ClipboardList },
  { title: "Message Templates", url: "/crm/message-templates", icon: MessageSquareText },
  { title: "Snippets", url: "/crm/snippets", icon: TextSelect },
  { title: "Segments (Lists)", url: "/crm/segments", icon: ListFilter },
];

// Commerce
const commerceItems = [
  { title: "Commerce Hub", url: "/commerce/hub", icon: Store },
  { title: "Quotes", url: "/quotes", icon: FileText },
  { title: "Orders", url: "/orders", icon: ShoppingCart },
  { title: "Invoices", url: "/invoices", icon: Receipt },
  { title: "Products", url: "/products", icon: Package },
  { title: "Inventory", url: "/inventory", icon: Warehouse },
];

// Service
const serviceItems = [
  { title: "Customer Success", url: "/service/customer-success", icon: Award },
  { title: "Ask Millie", url: "/service/customer-agent", icon: Bot },
  { title: "Tickets", url: "/crm/tickets", icon: Ticket },
  { title: "Inbox", url: "/crm/inbox", icon: Inbox },
  { title: "Chatflows", url: "/service/chatflows", icon: MessageCircle },
  { title: "Knowledge Base", url: "/service/knowledge-base", icon: BookOpenCheck },
  { title: "Customer Portal", url: "/service/customer-portal", icon: Globe },
  { title: "Overdue Accounts", url: "/service/overdue-accounts", icon: AlertTriangle },
  { title: "Service Analytics", url: "/service/analytics", icon: BarChart3 },
];

// Reporting
const reportingItems = [
  { title: "Dashboards", url: "/reporting/dashboards", icon: BarChart3 },
  { title: "Reports", url: "/reporting/reports", icon: FileText },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout, isAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const { data: pendingRequestCount } = useQuery<{ count: number }>({
    queryKey: ["/api/customer-order-requests/pending-count"],
    refetchInterval: 30000,
  });

  const isActive = (url: string) => {
    if (url === "/") return location === "/";
    return location.startsWith(url);
  };

  const isCrmActive = ["/contacts", "/companies", "/intelligence", "/production-list", "/orders", "/reporting/goals"].some(p => location.startsWith(p));
  const isSalesActive = location.startsWith("/sales") || location.startsWith("/deals") || ["/crm/calls", "/crm/tasks", "/crm/playbooks"].some(p => location.startsWith(p));
  const isMarketingActive = location.startsWith("/marketing") || ["/crm/segments", "/crm/message-templates", "/crm/snippets"].some(p => location.startsWith(p));
  const isCommerceActive = location.startsWith("/commerce") || ["/quotes", "/invoices", "/products", "/inventory"].some(p => location.startsWith(p));
  const isServiceActive = location.startsWith("/service") || ["/crm/tickets", "/crm/inbox"].some(p => location.startsWith(p));
  const isDataMgmtActive = location.startsWith("/data-management");
  const isReportingActive = location.startsWith("/reporting/dashboards") || location.startsWith("/reporting/reports");

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
            <Building2 className="w-5 h-5 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-sm">Purax CRM</span>
            <span className="text-xs text-muted-foreground">Order Management</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">

        {/* Main quick-links */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-medium text-muted-foreground px-2 py-1">Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild data-active={isActive("/")} className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground">
                  <Link href="/" data-testid="nav-dashboard"><LayoutDashboard className="w-4 h-4" /><span className="flex-1">Dashboard</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild data-active={isActive("/orders") && !isActive("/orders/requests")} className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground">
                  <Link href="/orders" data-testid="nav-orders"><ShoppingCart className="w-4 h-4" /><span className="flex-1">Orders</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild data-active={isActive("/orders/requests")} className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground">
                  <Link href="/orders/requests" data-testid="nav-order-requests">
                    <ClipboardCheck className="w-4 h-4" />
                    <span className="flex-1">Order Requests</span>
                    {pendingRequestCount?.count ? (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0 min-w-[20px] justify-center">{pendingRequestCount.count}</Badge>
                    ) : null}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild data-active={isActive("/service/customer-portal")} className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground">
                  <Link href="/service/customer-portal" data-testid="nav-customer-portal"><Globe className="w-4 h-4" /><span className="flex-1">Customer Portal</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild data-active={isActive("/service/overdue-accounts")} className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground">
                  <Link href="/service/overdue-accounts" data-testid="nav-overdue-accounts"><AlertTriangle className="w-4 h-4" /><span className="flex-1">Overdue Accounts</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* CRM */}
        <SidebarGroup>
          <Collapsible defaultOpen={isCrmActive} className="group/crm">
            <CollapsibleTrigger className="w-full">
              <SidebarGroupLabel className="text-xs font-medium text-muted-foreground px-2 py-1 cursor-pointer flex items-center justify-between gap-2 w-full">
                <div className="flex items-center gap-2"><Contact className="w-3.5 h-3.5" /><span>CRM</span></div>
                <ChevronDown className="w-3.5 h-3.5 transition-transform group-data-[state=open]/crm:rotate-180" />
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {crmItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild data-active={isActive(item.url)} className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground">
                        <Link href={item.url} data-testid={`nav-crm-${item.title.toLowerCase().replace(/[\s()]+/g, "-")}`}>
                          <item.icon className="w-4 h-4" /><span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        {/* Sales */}
        <SidebarGroup>
          <Collapsible defaultOpen={isSalesActive} className="group/sales">
            <CollapsibleTrigger className="w-full">
              <SidebarGroupLabel className="text-xs font-medium text-muted-foreground px-2 py-1 cursor-pointer flex items-center justify-between gap-2 w-full">
                <div className="flex items-center gap-2"><Briefcase className="w-3.5 h-3.5" /><span>Sales</span></div>
                <ChevronDown className="w-3.5 h-3.5 transition-transform group-data-[state=open]/sales:rotate-180" />
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {salesItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild data-active={isActive(item.url)} className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground">
                        <Link href={item.url} data-testid={`nav-sales-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                          <item.icon className="w-4 h-4" /><span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        {/* Marketing */}
        <SidebarGroup>
          <Collapsible defaultOpen={isMarketingActive} className="group/marketing">
            <CollapsibleTrigger className="w-full">
              <SidebarGroupLabel className="text-xs font-medium text-muted-foreground px-2 py-1 cursor-pointer flex items-center justify-between gap-2 w-full">
                <div className="flex items-center gap-2"><Megaphone className="w-3.5 h-3.5" /><span>Marketing</span></div>
                <ChevronDown className="w-3.5 h-3.5 transition-transform group-data-[state=open]/marketing:rotate-180" />
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {marketingItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild data-active={isActive(item.url)} className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground">
                        <Link href={item.url} data-testid={`nav-marketing-${item.title.toLowerCase().replace(/[\s()]+/g, "-")}`}>
                          <item.icon className="w-4 h-4" /><span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        {/* Commerce */}
        <SidebarGroup>
          <Collapsible defaultOpen={isCommerceActive} className="group/commerce">
            <CollapsibleTrigger className="w-full">
              <SidebarGroupLabel className="text-xs font-medium text-muted-foreground px-2 py-1 cursor-pointer flex items-center justify-between gap-2 w-full">
                <div className="flex items-center gap-2"><Store className="w-3.5 h-3.5" /><span>Commerce</span></div>
                <ChevronDown className="w-3.5 h-3.5 transition-transform group-data-[state=open]/commerce:rotate-180" />
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {commerceItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild data-active={isActive(item.url)} className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground">
                        <Link href={item.url} data-testid={`nav-commerce-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                          <item.icon className="w-4 h-4" /><span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        {/* Service */}
        <SidebarGroup>
          <Collapsible defaultOpen={isServiceActive} className="group/service">
            <CollapsibleTrigger className="w-full">
              <SidebarGroupLabel className="text-xs font-medium text-muted-foreground px-2 py-1 cursor-pointer flex items-center justify-between gap-2 w-full">
                <div className="flex items-center gap-2"><Headphones className="w-3.5 h-3.5" /><span>Service</span></div>
                <ChevronDown className="w-3.5 h-3.5 transition-transform group-data-[state=open]/service:rotate-180" />
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {serviceItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild data-active={isActive(item.url)} className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground">
                        <Link href={item.url} data-testid={`nav-service-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                          <item.icon className="w-4 h-4" /><span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        {/* Reporting */}
        <SidebarGroup>
          <Collapsible defaultOpen={isReportingActive} className="group/reporting">
            <CollapsibleTrigger className="w-full">
              <SidebarGroupLabel className="text-xs font-medium text-muted-foreground px-2 py-1 cursor-pointer flex items-center justify-between gap-2 w-full">
                <div className="flex items-center gap-2"><BarChart3 className="w-3.5 h-3.5" /><span>Reporting</span></div>
                <ChevronDown className="w-3.5 h-3.5 transition-transform group-data-[state=open]/reporting:rotate-180" />
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {reportingItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild data-active={isActive(item.url)} className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground">
                        <Link href={item.url} data-testid={`nav-reporting-${item.title.toLowerCase()}`}>
                          <item.icon className="w-4 h-4" /><span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        {/* Data Management */}
        <SidebarGroup>
          <Collapsible defaultOpen={isDataMgmtActive} className="group/datamgmt">
            <CollapsibleTrigger className="w-full">
              <SidebarGroupLabel className="text-xs font-medium text-muted-foreground px-2 py-1 cursor-pointer flex items-center justify-between gap-2 w-full">
                <div className="flex items-center gap-2"><Database className="w-3.5 h-3.5" /><span>Data Management</span></div>
                <ChevronDown className="w-3.5 h-3.5 transition-transform group-data-[state=open]/datamgmt:rotate-180" />
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {[
                    { title: "Data Agent", url: "/data-management/data-agent", icon: Sparkles },
                    { title: "Data Integration", url: "/data-management/data-integration", icon: Plug },
                    { title: "Event Management", url: "/data-management/event-management", icon: CalendarCheck },
                    { title: "Data Quality", url: "/data-management/data-quality", icon: ShieldCheck },
                    { title: "Data Studio", url: "/data-management/data-studio", icon: BarChart3 },
                    { title: "Data Model", url: "/data-management/data-model", icon: Blocks },
                    { title: "Data Enrichment", url: "/data-management/data-enrichment", icon: Database },
                  ].map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild data-active={isActive(item.url)} className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground">
                        <Link href={item.url} data-testid={`nav-dm-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                          <item.icon className="w-4 h-4" /><span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        {/* Admin */}
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs font-medium text-muted-foreground px-2 py-1">Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild data-active={isActive("/admin")} className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground">
                    <Link href="/admin" data-testid="nav-admin"><Settings className="w-4 h-4" /><span>Settings</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild data-active={isActive("/admin/price-lists")} className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground">
                    <Link href="/admin/price-lists" data-testid="nav-price-lists"><ListFilter className="w-4 h-4" /><span>Price Lists</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-sidebar-border">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-semibold text-primary">{user?.username?.[0]?.toUpperCase() ?? "U"}</span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">{user?.username}</p>
              <p className="text-[10px] text-muted-foreground capitalize truncate">{user?.role}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggleTheme} data-testid="btn-toggle-theme">
              {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={logout} data-testid="btn-logout">
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
