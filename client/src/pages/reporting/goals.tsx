import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Target,
  TrendingUp,
  Calendar,
  Plus,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import type { Order, Deal } from "@shared/schema";

interface DashboardStats {
  totalCompanies: number;
  totalContacts: number;
  totalOrders: number;
  totalRevenue: number;
  pendingOrders: number;
  activeDeals: number;
  companiesOnHold: number;
  recentOrders: Order[];
  dealsByStage: Record<string, number>;
}

export default function ReportingGoalsPage() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  const { data: orders } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const yearOrders = orders?.filter((o) => {
    const d = new Date(o.orderDate);
    return d.getFullYear() === selectedYear;
  }) || [];

  const yearRevenue = yearOrders.reduce(
    (sum, o) => sum + parseFloat(o.total as string || "0"),
    0
  );

  const monthlyRevenue = Array.from({ length: 12 }, (_, i) => {
    const monthOrders = yearOrders.filter((o) => new Date(o.orderDate).getMonth() === i);
    return {
      month: format(new Date(selectedYear, i, 1), "MMM"),
      revenue: monthOrders.reduce((sum, o) => sum + parseFloat(o.total as string || "0"), 0),
      count: monthOrders.length,
    };
  });

  const maxMonthlyRevenue = Math.max(...monthlyRevenue.map((m) => m.revenue), 1);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Goals"
        description="Track business performance and targets"
      />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-goals-overview">Goals Overview</TabsTrigger>
          <TabsTrigger value="team" data-testid="tab-team-performance">Team Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Revenue by Month</h2>
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setSelectedYear((y) => y - 1)}
                data-testid="button-year-prev"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-medium min-w-[100px] text-center" data-testid="text-selected-year">
                {selectedYear}
              </span>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setSelectedYear((y) => y + 1)}
                disabled={selectedYear >= currentYear}
                data-testid="button-year-next"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {selectedYear} Revenue
                </CardTitle>
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-year-revenue">{formatCurrency(yearRevenue)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {selectedYear} Orders
                </CardTitle>
                <Calendar className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-year-orders">{yearOrders.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Avg Order Value
                </CardTitle>
                <Target className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-avg-order">
                  {yearOrders.length > 0 ? formatCurrency(yearRevenue / yearOrders.length) : "$0"}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Monthly Revenue - {selectedYear}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {monthlyRevenue.map((m) => (
                  <div key={m.month} className="flex items-center gap-3">
                    <span className="text-sm w-10 text-muted-foreground">{m.month}</span>
                    <div className="flex-1 h-6 rounded-md bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-md bg-primary/70 transition-all"
                        style={{ width: `${(m.revenue / maxMonthlyRevenue) * 100}%` }}
                      />
                    </div>
                    <div className="text-right min-w-[120px]">
                      <span className="text-sm font-medium">{formatCurrency(m.revenue)}</span>
                      <span className="text-xs text-muted-foreground ml-2">({m.count})</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="team" className="mt-4">
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">
                <Target className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <h3 className="font-medium mb-1">Team Performance</h3>
                <p className="text-sm">Team performance tracking will be available as more data is collected.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
