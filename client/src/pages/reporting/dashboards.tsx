import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import {
  Building2,
  Users,
  ShoppingCart,
  Receipt,
  Target,
  TrendingUp,
  AlertTriangle,
  BarChart3,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import type { Company, Order, Deal } from "@shared/schema";

interface DashboardStats {
  totalCompanies: number;
  totalContacts: number;
  totalOrders: number;
  totalRevenue: number;
  pendingOrders: number;
  activeDeals: number;
  companiesOnHold: number;
  recentOrders: Order[];
  recentCompanies: Company[];
  dealsByStage: Record<string, number>;
}

const stageLabels: Record<string, string> = {
  prospecting: "Prospecting",
  qualification: "Qualification",
  proposal: "Proposal",
  negotiation: "Negotiation",
  closed_won: "Closed Won",
  closed_lost: "Closed Lost",
};

const stageColors: Record<string, string> = {
  prospecting: "bg-blue-500",
  qualification: "bg-cyan-500",
  proposal: "bg-yellow-500",
  negotiation: "bg-orange-500",
  closed_won: "bg-green-500",
  closed_lost: "bg-red-500",
};

export default function ReportingDashboardsPage() {
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

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      new: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
      confirmed: "bg-green-500/10 text-green-700 dark:text-green-400",
      in_production: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
      ready: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
      dispatched: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
      completed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
      cancelled: "bg-red-500/10 text-red-700 dark:text-red-400",
    };
    return colors[status] || colors.new;
  };

  const ordersByStatus = orders
    ? orders.reduce((acc, order) => {
        acc[order.status] = (acc[order.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    : {};

  const totalDealValue = stats?.dealsByStage
    ? Object.values(stats.dealsByStage).reduce((sum, count) => sum + count, 0)
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboards"
        description="Overview of key business metrics and performance"
      />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-8 rounded-md" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Companies</CardTitle>
                <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-stat-companies">{stats?.totalCompanies || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Active customers</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Contacts</CardTitle>
                <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                  <Users className="w-4 h-4 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-stat-contacts">{stats?.totalContacts || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">People in your CRM</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Orders</CardTitle>
                <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                  <ShoppingCart className="w-4 h-4 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-stat-orders">{stats?.totalOrders || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">{stats?.pendingOrders || 0} pending</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
                <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                  <Receipt className="w-4 h-4 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-stat-revenue">{formatCurrency(stats?.totalRevenue || 0)}</div>
                <p className="text-xs text-muted-foreground mt-1">All time</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {stats?.companiesOnHold && stats.companiesOnHold > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <CardTitle className="text-sm font-medium text-destructive">
                Attention Required
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {stats.companiesOnHold} {stats.companiesOnHold === 1 ? "company is" : "companies are"} currently on credit hold.
            </p>
            <Link href="/companies?creditStatus=on_hold">
              <Button variant="outline" size="sm" className="mt-2" data-testid="button-view-on-hold">
                View Companies on Hold
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Orders by Status</CardTitle>
            <CardDescription>Breakdown of current order statuses</CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(ordersByStatus).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(ordersByStatus)
                  .sort(([, a], [, b]) => b - a)
                  .map(([status, count]) => {
                    const total = orders?.length || 1;
                    const percentage = Math.round((count / total) * 100);
                    return (
                      <div key={status} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm capitalize">{status.replace("_", " ")}</span>
                          <span className="text-sm font-medium">{count}</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${getStatusColor(status).split(" ")[0].replace("/10", "")}`}
                            style={{ width: `${percentage}%`, backgroundColor: `hsl(var(--primary))`, opacity: 0.3 + (percentage / 100) * 0.7 }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No orders yet</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Deal Pipeline</CardTitle>
            <CardDescription>{totalDealValue} total deals across stages</CardDescription>
          </CardHeader>
          <CardContent>
            {stats?.dealsByStage && Object.keys(stats.dealsByStage).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(stats.dealsByStage).map(([stage, count]) => (
                  <div key={stage} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${stageColors[stage] || "bg-gray-500"}`} />
                      <span className="text-sm font-medium">{stageLabels[stage] || stage}</span>
                    </div>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Target className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No deals yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg">Recent Orders</CardTitle>
              <CardDescription>Latest orders from your customers</CardDescription>
            </div>
            <Link href="/orders">
              <Button variant="outline" size="sm" data-testid="button-view-all-orders">View All</Button>
            </Link>
          </CardHeader>
          <CardContent>
            {stats?.recentOrders && stats.recentOrders.length > 0 ? (
              <div className="space-y-3">
                {stats.recentOrders.slice(0, 5).map((order) => (
                  <Link key={order.id} href={`/orders/${order.id}`}>
                    <div className="flex items-center justify-between p-3 rounded-lg border hover-elevate cursor-pointer">
                      <div>
                        <p className="font-medium text-sm">{order.orderNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(order.orderDate), "MMM d, yyyy")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{formatCurrency(parseFloat(order.total as string))}</span>
                        <Badge className={getStatusColor(order.status)}>
                          {order.status.replace("_", " ")}
                        </Badge>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No orders yet</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg">Recent Companies</CardTitle>
              <CardDescription>Newly added customers</CardDescription>
            </div>
            <Link href="/companies">
              <Button variant="outline" size="sm" data-testid="button-view-all-companies">View All</Button>
            </Link>
          </CardHeader>
          <CardContent>
            {stats?.recentCompanies && stats.recentCompanies.length > 0 ? (
              <div className="space-y-3">
                {stats.recentCompanies.slice(0, 5).map((company) => (
                  <Link key={company.id} href={`/companies/${company.id}`}>
                    <div className="flex items-center justify-between p-3 rounded-lg border hover-elevate cursor-pointer">
                      <div>
                        <p className="font-medium text-sm">{company.tradingName || company.legalName}</p>
                        <p className="text-xs text-muted-foreground">{company.paymentTerms || "Net 30"}</p>
                      </div>
                      <Badge variant={company.creditStatus === "active" ? "outline" : "destructive"}>
                        {company.creditStatus}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Building2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No companies yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
