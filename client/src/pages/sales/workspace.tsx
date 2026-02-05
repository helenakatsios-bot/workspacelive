import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, TrendingUp, Clock, CheckCircle2, DollarSign, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function SalesWorkspacePage() {
  const { data: deals } = useQuery<any[]>({ queryKey: ["/api/deals"] });
  const { data: orders } = useQuery<any[]>({ queryKey: ["/api/orders"] });
  const { data: companies } = useQuery<any[]>({ queryKey: ["/api/companies"] });

  const openDeals = deals?.filter((d) => d.stage !== "closed_won" && d.stage !== "closed_lost") || [];
  const wonDeals = deals?.filter((d) => d.stage === "closed_won") || [];
  const recentOrders = orders?.slice(0, 5) || [];
  const totalPipeline = openDeals.reduce((sum, d) => sum + Number(d.value || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Sales Workspace</h1>
        <p className="text-muted-foreground">Your sales overview and daily priorities</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card data-testid="card-open-deals">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Deals</CardTitle>
            <Briefcase className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{openDeals.length}</div>
            <p className="text-xs text-muted-foreground">Active opportunities</p>
          </CardContent>
        </Card>
        <Card data-testid="card-pipeline-value">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pipeline Value</CardTitle>
            <DollarSign className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalPipeline.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Total open pipeline</p>
          </CardContent>
        </Card>
        <Card data-testid="card-won-deals">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Won Deals</CardTitle>
            <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{wonDeals.length}</div>
            <p className="text-xs text-muted-foreground">Closed won</p>
          </CardContent>
        </Card>
        <Card data-testid="card-total-customers">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Customers</CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{companies?.length || 0}</div>
            <p className="text-xs text-muted-foreground">Total companies</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-testid="card-deal-pipeline">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Deal Pipeline</CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link href="/deals" data-testid="link-view-all-deals">View All</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {openDeals.length === 0 ? (
              <p className="text-muted-foreground text-sm">No open deals</p>
            ) : (
              <div className="space-y-3">
                {openDeals.slice(0, 5).map((deal: any) => (
                  <div key={deal.id} className="flex items-center justify-between gap-2 p-3 rounded-md border">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{deal.title}</p>
                      <p className="text-xs text-muted-foreground">${Number(deal.value || 0).toLocaleString()}</p>
                    </div>
                    <Badge variant="secondary">{deal.stage?.replace(/_/g, " ")}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-recent-orders">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Recent Orders</CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link href="/orders" data-testid="link-view-all-orders">View All</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentOrders.length === 0 ? (
              <p className="text-muted-foreground text-sm">No recent orders</p>
            ) : (
              <div className="space-y-3">
                {recentOrders.map((order: any) => (
                  <div key={order.id} className="flex items-center justify-between gap-2 p-3 rounded-md border">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{order.orderNumber}</p>
                      <p className="text-xs text-muted-foreground">${Number(order.totalAmount || 0).toLocaleString()}</p>
                    </div>
                    <Badge variant="outline">{order.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
