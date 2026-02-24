import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  FileText,
  Building2,
  ShoppingCart,
  Users,
  Target,
  ChevronRight,
  Receipt,
  Package,
  BarChart3,
  Award,
  ListFilter,
  Ticket,
  CheckSquare,
  Phone,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";

export default function ReportingReportsPage() {
  const { data: companies, isLoading: loadingCompanies } = useQuery<any[]>({ queryKey: ["/api/companies"] });
  const { data: contacts } = useQuery<any[]>({ queryKey: ["/api/contacts"] });
  const { data: orders } = useQuery<any[]>({ queryKey: ["/api/orders"] });
  const { data: deals } = useQuery<any[]>({ queryKey: ["/api/deals"] });
  const { data: invoices } = useQuery<any[]>({ queryKey: ["/api/invoices"] });
  const { data: products } = useQuery<any[]>({ queryKey: ["/api/products"] });
  const { data: tickets } = useQuery<any[]>({ queryKey: ["/api/crm/tickets"] });
  const { data: tasks } = useQuery<any[]>({ queryKey: ["/api/crm/tasks"] });

  const reportsList = [
    {
      title: "Clients Since July 2021",
      description: "All companies that have placed orders from July 1, 2021 to today",
      icon: Calendar,
      url: "/reports/clients-since-july-2021",
      category: "Customers",
      count: null,
    },
    {
      title: "All Companies",
      description: "Complete list of all companies in the system with status and details",
      icon: Building2,
      url: "/companies",
      category: "Customers",
      count: companies?.length || 0,
    },
    {
      title: "All Contacts",
      description: "Complete contact directory across all companies",
      icon: Users,
      url: "/contacts",
      category: "Customers",
      count: contacts?.length || 0,
    },
    {
      title: "Customer Segments",
      description: "Customer segmentation by grade, status, and activity",
      icon: ListFilter,
      url: "/crm/segments",
      category: "Customers",
      count: null,
    },
    {
      title: "Grade A Clients",
      description: "Top-tier clients with highest order revenue",
      icon: Award,
      url: "/crm/segments",
      category: "Customers",
      count: companies?.filter((c) => c.clientGrade === "A")?.length || 0,
    },
    {
      title: "Inactive Customers",
      description: "Companies with no orders in the last 180 days",
      icon: AlertTriangle,
      url: "/crm/segments",
      category: "Customers",
      count: companies?.filter((c) => {
        if (!c.lastOrderDate) return true;
        const daysSince = (Date.now() - new Date(c.lastOrderDate).getTime()) / (1000 * 60 * 60 * 24);
        return daysSince > 180;
      })?.length || 0,
    },
    {
      title: "All Orders",
      description: "Full order listing with date-based filtering and search",
      icon: ShoppingCart,
      url: "/orders",
      category: "Sales",
      count: orders?.length || 0,
    },
    {
      title: "Deals Pipeline",
      description: "Active deals across all pipeline stages",
      icon: Target,
      url: "/deals",
      category: "Sales",
      count: deals?.length || 0,
    },
    {
      title: "Sales Forecast",
      description: "Revenue projections based on deal pipeline and probability",
      icon: TrendingUp,
      url: "/sales/forecast",
      category: "Sales",
      count: null,
    },
    {
      title: "Sales Analytics",
      description: "Detailed sales performance metrics and trends",
      icon: BarChart3,
      url: "/sales/analytics",
      category: "Sales",
      count: null,
    },
    {
      title: "All Invoices",
      description: "Invoice listing with status tracking and payment information",
      icon: Receipt,
      url: "/invoices",
      category: "Finance",
      count: invoices?.length || 0,
    },
    {
      title: "All Quotes",
      description: "Quote listing with status and conversion tracking",
      icon: FileText,
      url: "/quotes",
      category: "Finance",
      count: null,
    },
    {
      title: "Product Catalog",
      description: "Complete product listing with categories and pricing",
      icon: Package,
      url: "/products",
      category: "Products",
      count: products?.length || 0,
    },
    {
      title: "Support Tickets",
      description: "All support tickets with status and resolution tracking",
      icon: Ticket,
      url: "/crm/tickets",
      category: "Service",
      count: tickets?.length || 0,
    },
    {
      title: "Tasks Overview",
      description: "All CRM tasks with assignment and completion tracking",
      icon: CheckSquare,
      url: "/crm/tasks",
      category: "Service",
      count: tasks?.length || 0,
    },
    {
      title: "Call Log",
      description: "Complete history of logged calls with outcomes and notes",
      icon: Phone,
      url: "/crm/calls",
      category: "Service",
      count: null,
    },
  ];

  const categories = ["Customers", "Sales", "Finance", "Products", "Service"];

  if (loadingCompanies) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" description="Access business reports and data exports" />
        {categories.map((cat) => (
          <div key={cat} className="space-y-3">
            <Skeleton className="h-4 w-24" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Access business reports and data exports"
      />

      {categories.map((category) => {
        const categoryReports = reportsList.filter((r) => r.category === category);
        if (categoryReports.length === 0) return null;
        return (
          <div key={category} className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider" data-testid={`text-category-${category.toLowerCase()}`}>
              {category}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {categoryReports.map((report) => (
                <Link key={report.url + report.title} href={report.url}>
                  <Card className="hover-elevate cursor-pointer h-full" data-testid={`card-report-${report.title.toLowerCase().replace(/\s+/g, "-")}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <report.icon className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-sm">{report.title}</h3>
                            {report.count !== null && (
                              <Badge variant="secondary" className="text-[10px]">{report.count}</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{report.description}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
