import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { BarChart3, Database, PieChart, TrendingUp } from "lucide-react";
import type { Company, Order, Product } from "@shared/schema";
import { format, subMonths } from "date-fns";

function BarRow({ label, count, total, color }: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="space-y-1" data-testid={`bar-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className="font-medium">{count}</span>
      </div>
      <div className="h-2 rounded-full bg-muted">
        <div
          className={`h-2 rounded-full ${color}`}
          style={{ width: `${Math.max(pct, 1)}%` }}
        />
      </div>
    </div>
  );
}

function RevenueBar({ label, amount, maxAmount }: {
  label: string;
  amount: number;
  maxAmount: number;
}) {
  const pct = maxAmount > 0 ? (amount / maxAmount) * 100 : 0;
  return (
    <div className="space-y-1" data-testid={`bar-revenue-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className="font-medium">${amount.toLocaleString("en-AU", { minimumFractionDigits: 0 })}</span>
      </div>
      <div className="h-2 rounded-full bg-muted">
        <div
          className="h-2 rounded-full bg-primary"
          style={{ width: `${Math.max(pct, 1)}%` }}
        />
      </div>
    </div>
  );
}

function ChartCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-2 w-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function DataStudioPage() {
  const { data: companies, isLoading: loadingCompanies } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const { data: orders, isLoading: loadingOrders } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
  });

  const { data: products, isLoading: loadingProducts } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const isLoading = loadingCompanies || loadingOrders || loadingProducts;

  const gradeBreakdown = useMemo(() => {
    if (!companies) return [];
    const counts: Record<string, number> = { A: 0, B: 0, C: 0, Ungraded: 0 };
    companies.forEach(c => {
      const grade = c.clientGrade || "Ungraded";
      counts[grade] = (counts[grade] || 0) + 1;
    });
    return Object.entries(counts).map(([label, count]) => ({ label, count }));
  }, [companies]);

  const statusBreakdown = useMemo(() => {
    if (!orders) return [];
    const counts: Record<string, number> = {};
    orders.forEach(o => {
      const status = o.status.replace(/_/g, " ");
      counts[status] = (counts[status] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count }));
  }, [orders]);

  const categoryBreakdown = useMemo(() => {
    if (!products) return [];
    const counts: Record<string, number> = {};
    products.forEach(p => {
      const cat = p.category || "Uncategorized";
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count }));
  }, [products]);

  const revenueByMonth = useMemo(() => {
    if (!orders) return [];
    const now = new Date();
    const months: { key: string; label: string; amount: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(now, i);
      const key = format(d, "yyyy-MM");
      months.push({ key, label: format(d, "MMM yyyy"), amount: 0 });
    }
    orders.forEach(o => {
      const dateStr = o.orderDate ? format(new Date(o.orderDate), "yyyy-MM") : null;
      if (dateStr) {
        const m = months.find(m => m.key === dateStr);
        if (m) m.amount += parseFloat(o.total || "0");
      }
    });
    return months;
  }, [orders]);

  const maxRevenue = Math.max(...(revenueByMonth.map(m => m.amount)), 1);

  const colors = ["bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-purple-500", "bg-rose-500", "bg-cyan-500", "bg-indigo-500", "bg-orange-500"];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Studio"
        description="Explore and visualize your CRM data"
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ChartCardSkeleton />
          <ChartCardSkeleton />
          <ChartCardSkeleton />
          <ChartCardSkeleton />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card data-testid="card-companies-by-grade">
            <CardHeader className="flex flex-row items-center gap-2 space-y-0">
              <BarChart3 className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">Companies by Grade</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {gradeBreakdown.map((item, idx) => (
                <BarRow
                  key={item.label}
                  label={item.label}
                  count={item.count}
                  total={companies?.length ?? 0}
                  color={colors[idx % colors.length]}
                />
              ))}
            </CardContent>
          </Card>

          <Card data-testid="card-orders-by-status">
            <CardHeader className="flex flex-row items-center gap-2 space-y-0">
              <PieChart className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">Orders by Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {statusBreakdown.map((item, idx) => (
                <BarRow
                  key={item.label}
                  label={item.label}
                  count={item.count}
                  total={orders?.length ?? 0}
                  color={colors[idx % colors.length]}
                />
              ))}
            </CardContent>
          </Card>

          <Card data-testid="card-products-by-category">
            <CardHeader className="flex flex-row items-center gap-2 space-y-0">
              <Database className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">Products by Category</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {categoryBreakdown.slice(0, 8).map((item, idx) => (
                <BarRow
                  key={item.label}
                  label={item.label}
                  count={item.count}
                  total={products?.length ?? 0}
                  color={colors[idx % colors.length]}
                />
              ))}
              {categoryBreakdown.length > 8 && (
                <p className="text-xs text-muted-foreground">+{categoryBreakdown.length - 8} more categories</p>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-revenue-by-month">
            <CardHeader className="flex flex-row items-center gap-2 space-y-0">
              <TrendingUp className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">Revenue by Month (Last 6)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {revenueByMonth.map(item => (
                <RevenueBar
                  key={item.key}
                  label={item.label}
                  amount={item.amount}
                  maxAmount={maxRevenue}
                />
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
