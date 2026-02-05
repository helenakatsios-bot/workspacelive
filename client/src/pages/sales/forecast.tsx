import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, DollarSign, Target, ArrowUpRight, ArrowDownRight } from "lucide-react";

export default function SalesForecastPage() {
  const { data: deals } = useQuery<any[]>({ queryKey: ["/api/deals"] });
  const { data: orders } = useQuery<any[]>({ queryKey: ["/api/orders"] });

  const openDeals = deals?.filter((d) => d.stage !== "closed_won" && d.stage !== "closed_lost") || [];
  const totalPipeline = openDeals.reduce((sum, d) => sum + Number(d.value || 0), 0);
  const wonDeals = deals?.filter((d) => d.stage === "closed_won") || [];
  const wonRevenue = wonDeals.reduce((sum, d) => sum + Number(d.value || 0), 0);
  const totalOrders = orders?.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0) || 0;

  const stages = [
    { name: "Qualification", probability: 20 },
    { name: "Proposal", probability: 40 },
    { name: "Negotiation", probability: 60 },
    { name: "Closing", probability: 80 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Forecast</h1>
        <p className="text-muted-foreground">Sales forecast and revenue projections</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card data-testid="card-total-pipeline">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Pipeline</CardTitle>
            <DollarSign className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalPipeline.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">{openDeals.length} open deals</p>
          </CardContent>
        </Card>
        <Card data-testid="card-won-revenue">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Won Revenue</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${wonRevenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">{wonDeals.length} closed deals</p>
          </CardContent>
        </Card>
        <Card data-testid="card-order-revenue">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Order Revenue</CardTitle>
            <Target className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalOrders.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">{orders?.length || 0} total orders</p>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-weighted-pipeline">
        <CardHeader>
          <CardTitle>Weighted Pipeline by Stage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {stages.map((stage) => {
              const stageDeals = openDeals.filter((d) =>
                d.stage?.toLowerCase().includes(stage.name.toLowerCase())
              );
              const stageValue = stageDeals.reduce((sum, d) => sum + Number(d.value || 0), 0);
              const weighted = stageValue * (stage.probability / 100);
              const maxValue = totalPipeline || 1;

              return (
                <div key={stage.name} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{stage.name}</span>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span>{stage.probability}% likely</span>
                      <span className="font-medium text-foreground">${weighted.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.min((stageValue / maxValue) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
