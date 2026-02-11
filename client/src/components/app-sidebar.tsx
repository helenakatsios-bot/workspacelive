import { Link, useLocation } from "wouter";
import {
  Building2,
  Users,
  Target,
  FileText,
  Package,
  Receipt,
  LayoutDashboard,
  Settings,
  LogOut,
  ShoppingCart,
  Moon,
  Sun,
  Calendar,
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
  HelpCircle,
  Award,
  Bot,
  MessageCircle,
  BookOpenCheck,
  Globe,
  ClipboardCheck,
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

const mainNavItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Orders", url: "/orders", icon: ShoppingCart },
  { title: "Products", url: "/products", icon: Package },
  { title: "Email", url: "/marketing/email", icon: Mail },
];

const crmItems = [
  { title: "Contacts", url: "/contacts", icon: Users },
  { title: "Companies", url: "/companies", icon: Building2 },
  { title: "Deals", url: "/deals", icon: Target },
  { title: "Tickets", url: "/crm/tickets", icon: Ticket },
  { title: "Orders", url: "/orders", icon: ShoppingCart },
  { title: "Order Requests", url: "/orders/requests", icon: ClipboardCheck },
  { title: "Projects", url: "/crm/projects", icon: FolderKanban, badge: "BETA" },
  { title: "Segments (Lists)", url: "/crm/segments", icon: ListFilter },
  { title: "Inbox", url: "/crm/inbox", icon: Inbox },
  { title: "Calls", url: "/crm/calls", icon: Phone },
  { title: "Tasks", url: "/crm/tasks", icon: CheckSquare },
  { title: "Forms", url: "/marketing/forms", icon: ClipboardList },
  { title: "Playbooks", url: "/crm/playbooks", icon: BookOpen },
  { title: "Message Templates", url: "/crm/message-templates", icon: MessageSquareText },
  { title: "Snippets", url: "/crm/snippets", icon: TextSelect },
];

const transactionItems = [
  { title: "Quotes", url: "/quotes", icon: FileText },
  { title: "Invoices", url: "/invoices", icon: Receipt },
];

const salesItems = [
  { title: "Sales Workspace", url: "/sales/workspace", icon: Briefcase },
  { title: "Documents", url: "/sales/documents", icon: FolderOpen },
  { title: "Activity Feed", url: "/sales/activity-feed", icon: Activity },
  { title: "Forecast", url: "/sales/forecast", icon: TrendingUp },
  { title: "Sales Analytics", url: "/sales/analytics", icon: BarChart2 },
];


const serviceItems = [
  { title: "Customer Success", url: "/service/customer-success", icon: Award },
  { title: "Ask Millie", url: "/service/customer-agent", icon: Bot },
  { title: "Chatflows", url: "/service/chatflows", icon: MessageCircle },
  { title: "Knowledge Base", url: "/service/knowledge-base", icon: BookOpenCheck },
  { title: "Customer Portal", url: "/service/customer-portal", icon: Globe },
  { title: "Service Analytics", url: "/service/analytics", icon: BarChart3 },
];

const reportingItems = [
  { title: "Dashboards", url: "/reporting/dashboards", icon: BarChart3 },
  { title: "Reports", url: "/reporting/reports", icon: FileText },
  { title: "Goals", url: "/reporting/goals", icon: Target },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout, isAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const isActive = (url: string) => {
    if (url === "/") return location === "/";
    return location.startsWith(url);
  };

  const isCrmActive = location.startsWith("/crm") || location.startsWith("/marketing") || ["/contacts", "/companies", "/deals", "/orders"].some(p => location.startsWith(p)) || location === "/orders/requests";
  const isTransactionsActive = ["/quotes", "/invoices"].some(p => location.startsWith(p));
  const isSalesActive = location.startsWith("/sales");

  const isCommerceActive = location.startsWith("/commerce");
  const isServiceActive = location.startsWith("/service");
  const isDataMgmtActive = location.startsWith("/data-management");
  const isReportingActive = location.startsWith("/reporting") || location.startsWith("/reports");

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
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-medium text-muted-foreground px-2 py-1">
            Main
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    data-active={isActive(item.url)}
                    className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                  >
                    <Link href={item.url} data-testid={`nav-${item.title.toLowerCase()}`}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <Collapsible defaultOpen={isCrmActive} className="group/crm">
            <CollapsibleTrigger className="w-full">
              <SidebarGroupLabel className="text-xs font-medium text-muted-foreground px-2 py-1 cursor-pointer flex items-center justify-between gap-2 w-full">
                <div className="flex items-center gap-2">
                  <Contact className="w-3.5 h-3.5" />
                  <span>CRM</span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 transition-transform group-data-[state=open]/crm:rotate-180" />
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {crmItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        data-active={isActive(item.url)}
                        className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                      >
                        <Link href={item.url} data-testid={`nav-crm-${item.title.toLowerCase().replace(/[\s()]+/g, "-")}`}>
                          <item.icon className="w-4 h-4" />
                          <span className="flex-1">{item.title}</span>
                          {"badge" in item && item.badge && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{item.badge}</Badge>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        <SidebarGroup>
          <Collapsible defaultOpen={isTransactionsActive} className="group/transactions">
            <CollapsibleTrigger className="w-full">
              <SidebarGroupLabel className="text-xs font-medium text-muted-foreground px-2 py-1 cursor-pointer flex items-center justify-between gap-2 w-full">
                <div className="flex items-center gap-2">
                  <Receipt className="w-3.5 h-3.5" />
                  <span>Transactions</span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 transition-transform group-data-[state=open]/transactions:rotate-180" />
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {transactionItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        data-active={isActive(item.url)}
                        className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                      >
                        <Link href={item.url} data-testid={`nav-${item.title.toLowerCase()}`}>
                          <item.icon className="w-4 h-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        <SidebarGroup>
          <Collapsible defaultOpen={isSalesActive} className="group/sales">
            <CollapsibleTrigger className="w-full">
              <SidebarGroupLabel className="text-xs font-medium text-muted-foreground px-2 py-1 cursor-pointer flex items-center justify-between gap-2 w-full">
                <div className="flex items-center gap-2">
                  <Briefcase className="w-3.5 h-3.5" />
                  <span>Sales</span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 transition-transform group-data-[state=open]/sales:rotate-180" />
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {salesItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        data-active={isActive(item.url)}
                        className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                      >
                        <Link href={item.url} data-testid={`nav-sales-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                          <item.icon className="w-4 h-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>


        <SidebarGroup>
          <Collapsible defaultOpen={isCommerceActive} className="group/commerce">
            <CollapsibleTrigger className="w-full">
              <SidebarGroupLabel className="text-xs font-medium text-muted-foreground px-2 py-1 cursor-pointer flex items-center justify-between gap-2 w-full">
                <div className="flex items-center gap-2">
                  <Store className="w-3.5 h-3.5" />
                  <span>Commerce</span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 transition-transform group-data-[state=open]/commerce:rotate-180" />
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      data-active={isActive("/commerce/hub")}
                      className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                    >
                      <Link href="/commerce/hub" data-testid="nav-commerce-hub">
                        <Store className="w-4 h-4" />
                        <span>Commerce Hub</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      data-active={isActive("/quotes")}
                      className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                    >
                      <Link href="/quotes" data-testid="nav-commerce-quotes">
                        <FileText className="w-4 h-4" />
                        <span>Quotes</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      data-active={isActive("/orders")}
                      className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                    >
                      <Link href="/orders" data-testid="nav-commerce-orders">
                        <ShoppingCart className="w-4 h-4" />
                        <span>Orders</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      data-active={isActive("/invoices")}
                      className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                    >
                      <Link href="/invoices" data-testid="nav-commerce-invoices">
                        <Receipt className="w-4 h-4" />
                        <span>Invoices</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      data-active={isActive("/products")}
                      className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                    >
                      <Link href="/products" data-testid="nav-commerce-products">
                        <Package className="w-4 h-4" />
                        <span>Products</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        <SidebarGroup>
          <Collapsible defaultOpen={isServiceActive} className="group/service">
            <CollapsibleTrigger className="w-full">
              <SidebarGroupLabel className="text-xs font-medium text-muted-foreground px-2 py-1 cursor-pointer flex items-center justify-between gap-2 w-full">
                <div className="flex items-center gap-2">
                  <Headphones className="w-3.5 h-3.5" />
                  <span>Service</span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 transition-transform group-data-[state=open]/service:rotate-180" />
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {serviceItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        data-active={isActive(item.url)}
                        className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                      >
                        <Link href={item.url} data-testid={`nav-service-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                          <item.icon className="w-4 h-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        <SidebarGroup>
          <Collapsible defaultOpen={isDataMgmtActive} className="group/datamgmt">
            <CollapsibleTrigger className="w-full">
              <SidebarGroupLabel className="text-xs font-medium text-muted-foreground px-2 py-1 cursor-pointer flex items-center justify-between gap-2 w-full">
                <div className="flex items-center gap-2">
                  <Database className="w-3.5 h-3.5" />
                  <span>Data Management</span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 transition-transform group-data-[state=open]/datamgmt:rotate-180" />
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      data-active={isActive("/data-management/data-agent")}
                      className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                    >
                      <Link href="/data-management/data-agent" data-testid="nav-data-agent">
                        <Sparkles className="w-4 h-4" />
                        <span>Data Agent</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      data-active={isActive("/data-management/data-integration")}
                      className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                    >
                      <Link href="/data-management/data-integration" data-testid="nav-data-integration">
                        <Plug className="w-4 h-4" />
                        <span>Data Integration</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      data-active={isActive("/data-management/event-management")}
                      className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                    >
                      <Link href="/data-management/event-management" data-testid="nav-event-management">
                        <CalendarCheck className="w-4 h-4" />
                        <span>Event Management</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      data-active={isActive("/data-management/data-quality")}
                      className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                    >
                      <Link href="/data-management/data-quality" data-testid="nav-data-quality">
                        <ShieldCheck className="w-4 h-4" />
                        <span>Data Quality</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      data-active={isActive("/data-management/data-studio")}
                      className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                    >
                      <Link href="/data-management/data-studio" data-testid="nav-data-studio">
                        <BarChart3 className="w-4 h-4" />
                        <span>Data Studio</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      data-active={isActive("/data-management/data-model")}
                      className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                    >
                      <Link href="/data-management/data-model" data-testid="nav-data-model">
                        <Blocks className="w-4 h-4" />
                        <span>Data Model</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      data-active={isActive("/data-management/data-enrichment")}
                      className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                    >
                      <Link href="/data-management/data-enrichment" data-testid="nav-data-enrichment">
                        <Database className="w-4 h-4" />
                        <span>Data Enrichment</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        <SidebarGroup>
          <Collapsible defaultOpen={isReportingActive} className="group/reporting">
            <CollapsibleTrigger className="w-full">
              <SidebarGroupLabel className="text-xs font-medium text-muted-foreground px-2 py-1 cursor-pointer flex items-center justify-between gap-2 w-full">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span>Reporting</span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 transition-transform group-data-[state=open]/reporting:rotate-180" />
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {reportingItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        data-active={isActive(item.url)}
                        className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                      >
                        <Link href={item.url} data-testid={`nav-reporting-${item.title.toLowerCase()}`}>
                          <item.icon className="w-4 h-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs font-medium text-muted-foreground px-2 py-1">
              Admin
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    data-active={isActive("/admin")}
                    className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                  >
                    <Link href="/admin" data-testid="nav-admin">
                      <Settings className="w-4 h-4" />
                      <span>Settings</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-sidebar-border">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-medium text-primary">
                {user?.name?.charAt(0).toUpperCase() || "U"}
              </span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium truncate">{user?.name || "User"}</span>
              <span className="text-xs text-muted-foreground capitalize">{user?.role || "user"}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              onClick={toggleTheme}
              data-testid="button-theme-toggle"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={logout}
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
