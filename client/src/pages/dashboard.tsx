import { useQuery } from "@tanstack/react-query";
import { Building2, Users, ShoppingCart, Receipt, Target, TrendingUp, CalendarCheck, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { format } from "date-fns";
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

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  description,
  trend
}: { 
  title: string; 
  value: string | number; 
  icon: any;
  description?: string;
  trend?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
          <Icon className="w-4 h-4 text-primary" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
        {trend && (
          <div className="flex items-center gap-1 mt-1">
            <TrendingUp className="w-3 h-3 text-green-600" />
            <span className="text-xs text-green-600">{trend}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-8 rounded-md" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-3 w-32 mt-2" />
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
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
      on_hold: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
    };
    return colors[status] || colors.new;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-dashboard-title">
          Welcome back, {user?.name?.split(" ")[0] || "User"}
        </h1>
        <p className="text-muted-foreground">
          Here's an overview of your business activity
        </p>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard
              title="Total Companies"
              value={stats?.totalCompanies || 0}
              icon={Building2}
              description="Active customers"
            />
            <StatCard
              title="Total Orders"
              value={stats?.totalOrders || 0}
              icon={ShoppingCart}
              description={`${stats?.pendingOrders || 0} pending`}
            />
            <StatCard
              title="Total Revenue"
              value={formatCurrency(stats?.totalRevenue || 0)}
              icon={Receipt}
              description="All time"
            />
            <StatCard
              title="Active Deals"
              value={stats?.activeDeals || 0}
              icon={Target}
              description="In pipeline"
            />
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
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">Recent Orders</CardTitle>
              <CardDescription>Latest orders from your customers</CardDescription>
            </div>
            <Link href="/orders">
              <Button variant="outline" size="sm" data-testid="button-view-all-orders">
                View All
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                    <Skeleton className="h-6 w-20" />
                  </div>
                ))}
              </div>
            ) : stats?.recentOrders && stats.recentOrders.length > 0 ? (
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
                        <span className="text-sm font-medium">
                          {formatCurrency(parseFloat(order.total as string))}
                        </span>
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
                <p>No orders yet</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">Recent Companies</CardTitle>
              <CardDescription>Newly added customers</CardDescription>
            </div>
            <Link href="/companies">
              <Button variant="outline" size="sm" data-testid="button-view-all-companies">
                View All
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-6 w-16" />
                  </div>
                ))}
              </div>
            ) : stats?.recentCompanies && stats.recentCompanies.length > 0 ? (
              <div className="space-y-3">
                {stats.recentCompanies.slice(0, 5).map((company) => (
                  <Link key={company.id} href={`/companies/${company.id}`}>
                    <div className="flex items-center justify-between p-3 rounded-lg border hover-elevate cursor-pointer">
                      <div>
                        <p className="font-medium text-sm">{company.tradingName || company.legalName}</p>
                        <p className="text-xs text-muted-foreground">
                          {company.paymentTerms || "Net 30"}
                        </p>
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
                <p>No companies yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Quick Actions</CardTitle>
            <CardDescription>Common tasks to get started</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
            <Link href="/companies/new">
              <Button variant="outline" className="w-full h-auto py-4 flex-col gap-2" data-testid="button-new-company">
                <Building2 className="w-5 h-5" />
                <span className="text-xs">New Company</span>
              </Button>
            </Link>
            <Link href="/orders/new">
              <Button variant="outline" className="w-full h-auto py-4 flex-col gap-2" data-testid="button-new-order">
                <ShoppingCart className="w-5 h-5" />
                <span className="text-xs">New Order</span>
              </Button>
            </Link>
            <Link href="/orders?preset=since-july-2021">
              <Button variant="outline" className="w-full h-auto py-4 flex-col gap-2" data-testid="button-clients-since-july">
                <CalendarCheck className="w-5 h-5" />
                <span className="text-xs">Clients Since July 2021</span>
              </Button>
            </Link>
            <Link href="/deals/new">
              <Button variant="outline" className="w-full h-auto py-4 flex-col gap-2" data-testid="button-new-deal">
                <Target className="w-5 h-5" />
                <span className="text-xs">New Deal</span>
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
