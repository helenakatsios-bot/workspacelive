import { Link } from "wouter";
import {
  Calendar,
  FileText,
  Building2,
  ShoppingCart,
  Users,
  Target,
  Download,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";

const reportsList = [
  {
    title: "Clients Since July 2021",
    description: "All companies that have placed orders from July 1, 2021 to today",
    icon: Calendar,
    url: "/reports/clients-since-july-2021",
    category: "Customers",
  },
  {
    title: "All Companies",
    description: "Complete list of all companies in the system with status and details",
    icon: Building2,
    url: "/companies",
    category: "Customers",
  },
  {
    title: "All Orders",
    description: "Full order listing with date-based filtering and search",
    icon: ShoppingCart,
    url: "/orders",
    category: "Sales",
  },
  {
    title: "All Contacts",
    description: "Complete contact directory across all companies",
    icon: Users,
    url: "/contacts",
    category: "Customers",
  },
  {
    title: "Deals Pipeline",
    description: "Active deals across all pipeline stages",
    icon: Target,
    url: "/deals",
    category: "Sales",
  },
  {
    title: "All Invoices",
    description: "Invoice listing with status tracking",
    icon: FileText,
    url: "/invoices",
    category: "Finance",
  },
];

const categories = ["Customers", "Sales", "Finance"];

export default function ReportingReportsPage() {
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
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{category}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {categoryReports.map((report) => (
                <Link key={report.url} href={report.url}>
                  <Card className="hover-elevate cursor-pointer h-full">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <report.icon className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-sm" data-testid={`text-report-${report.title.toLowerCase().replace(/\s+/g, "-")}`}>
                            {report.title}
                          </h3>
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
