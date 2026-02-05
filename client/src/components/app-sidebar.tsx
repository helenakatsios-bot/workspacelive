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
  Megaphone,
  Mail,
  ClipboardList,
  BarChart2,
  Send,
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
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/components/theme-provider";

const mainNavItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Companies", url: "/companies", icon: Building2 },
  { title: "Contacts", url: "/contacts", icon: Users },
  { title: "Deals", url: "/deals", icon: Target },
  { title: "Products", url: "/products", icon: Package },
];

const transactionItems = [
  { title: "Quotes", url: "/quotes", icon: FileText },
  { title: "Orders", url: "/orders", icon: ShoppingCart },
  { title: "Invoices", url: "/invoices", icon: Receipt },
];

const salesItems = [
  { title: "Sales Workspace", url: "/sales/workspace", icon: Briefcase },
  { title: "Documents", url: "/sales/documents", icon: FolderOpen },
  { title: "Activity Feed", url: "/sales/activity-feed", icon: Activity },
  { title: "Forecast", url: "/sales/forecast", icon: TrendingUp },
  { title: "Sales Analytics", url: "/sales/analytics", icon: BarChart2 },
];

const marketingItems = [
  { title: "Campaigns", url: "/marketing/campaigns", icon: Megaphone },
  { title: "Email", url: "/marketing/email", icon: Mail },
  { title: "Forms", url: "/marketing/forms", icon: ClipboardList },
  { title: "Marketing Analytics", url: "/marketing/analytics", icon: BarChart3 },
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

  const isSalesActive = location.startsWith("/sales");
  const isMarketingActive = location.startsWith("/marketing");
  const isReportingActive = location.startsWith("/reporting") || location.startsWith("/reports");

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
            <Building2 className="w-5 h-5 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-sm">Business CRM</span>
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
          <SidebarGroupLabel className="text-xs font-medium text-muted-foreground px-2 py-1">
            Transactions
          </SidebarGroupLabel>
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
          <Collapsible defaultOpen={isMarketingActive} className="group/marketing">
            <CollapsibleTrigger className="w-full">
              <SidebarGroupLabel className="text-xs font-medium text-muted-foreground px-2 py-1 cursor-pointer flex items-center justify-between gap-2 w-full">
                <div className="flex items-center gap-2">
                  <Send className="w-3.5 h-3.5" />
                  <span>Marketing</span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 transition-transform group-data-[state=open]/marketing:rotate-180" />
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {marketingItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        data-active={isActive(item.url)}
                        className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                      >
                        <Link href={item.url} data-testid={`nav-marketing-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
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
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      data-active={isActive("/reports/clients-since-july-2021")}
                      className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                    >
                      <Link href="/reports/clients-since-july-2021" data-testid="nav-clients-since-july-2021">
                        <Calendar className="w-4 h-4" />
                        <span>Clients Since July 2021</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
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
