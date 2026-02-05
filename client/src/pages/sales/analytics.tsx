import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, TrendingUp, DollarSign, ShoppingCart, Target, Percent } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function SalesAnalyticsPage() {
  const { data: deals } = useQuery<any[]>({ queryKey: ["/api/deals"] });
  const { data: orders } = useQuery<any[]>({ queryKey: ["/api/orders"] });
  const { data: companies } = useQuery<any[]>({ queryKey: ["/api/companies"] });

  const totalDeals = deals?.length || 0;
  const wonDeals = deals?.filter((d) => d.stage === "closed_won") || [];
  const lostDeals = deals?.filter((d) => d.stage === "closed_lost") || [];
  const winRate = totalDeals > 0 ? ((wonDeals.length / totalDeals) * 100).toFixed(1) : "0";
  const totalRevenue = orders?.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0) || 0;
  const avgDealSize = wonDeals.length > 0
    ? wonDeals.reduce((sum, d) => sum + Number(d.value || 0), 0) / wonDeals.length
    : 0;

  const stageDistribution = deals?.reduce((acc: Record<string, number>, deal: any) => {
    const stage = deal.stage || "unknown";
    acc[stage] = (acc[stage] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Sales Analytics</h1>
        <p className="text-muted-foreground">Key sales metrics and performance insights</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card data-testid="card-total-revenue">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalRevenue.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card data-testid="card-win-rate">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
            <Percent className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{winRate}%</div>
            <p className="text-xs text-muted-foreground">{wonDeals.length} won / {totalDeals} total</p>
          </CardContent>
        </Card>
        <Card data-testid="card-avg-deal-size">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Deal Size</CardTitle>
            <Target className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${avgDealSize.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          </CardContent>
        </Card>
        <Card data-testid="card-total-orders">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <ShoppingCart className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{orders?.length || 0}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-testid="card-deal-stages">
          <CardHeader>
            <CardTitle>Deal Distribution by Stage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(stageDistribution).map(([stage, count]) => {
                const percentage = totalDeals > 0 ? ((count as number) / totalDeals) * 100 : 0;
                return (
                  <div key={stage} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium capitalize">{stage.replace(/_/g, " ")}</span>
                      <span className="text-sm text-muted-foreground">{count as number}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-performance-summary">
          <CardHeader>
            <CardTitle>Performance Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 p-3 rounded-md border">
                <span className="text-sm">Total Companies</span>
                <span className="font-semibold">{companies?.length || 0}</span>
              </div>
              <div className="flex items-center justify-between gap-2 p-3 rounded-md border">
                <span className="text-sm">Total Deals</span>
                <span className="font-semibold">{totalDeals}</span>
              </div>
              <div className="flex items-center justify-between gap-2 p-3 rounded-md border">
                <span className="text-sm">Won Deals</span>
                <Badge variant="default">{wonDeals.length}</Badge>
              </div>
              <div className="flex items-center justify-between gap-2 p-3 rounded-md border">
                <span className="text-sm">Lost Deals</span>
                <Badge variant="secondary">{lostDeals.length}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
