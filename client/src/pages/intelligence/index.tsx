import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Package,
  Users, DollarSign, Clock, Activity, Zap, Brain, BarChart2,
  ArrowUp, ArrowDown, Minus,
} from "lucide-react";
import { format, parseISO } from "date-fns";

const COLORS = ["#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#14b8a6"];
const fmt$ = (n: number) => `$${n.toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

function KpiCard({ label, value, sub, icon: Icon, trend, color = "blue" }: {
  label: string; value: string; sub?: string; icon: any; trend?: number; color?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
            {trend !== undefined && (
              <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${trend > 0 ? "text-green-600" : trend < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                {trend > 0 ? <ArrowUp className="w-3 h-3" /> : trend < 0 ? <ArrowDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                {Math.abs(trend).toFixed(1)}% vs last month
              </div>
            )}
          </div>
          <div className={`p-2 rounded-lg bg-${color}-100 dark:bg-${color}-900/20`}>
            <Icon className={`w-5 h-5 text-${color}-600 dark:text-${color}-400`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AlertBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; variant: "destructive" | "secondary" | "outline" }> = {
    out_of_stock: { label: "Out of Stock", variant: "destructive" },
    fully_reserved: { label: "Fully Reserved", variant: "destructive" },
    below_reorder: { label: "Below Reorder Point", variant: "secondary" },
    critical: { label: "Critical", variant: "destructive" },
  };
  const cfg = map[type] || { label: type, variant: "outline" as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function VelocityBadge({ v }: { v: string }) {
  const map: Record<string, string> = { fast: "bg-green-100 text-green-700", medium: "bg-yellow-100 text-yellow-700", slow: "bg-gray-100 text-gray-600", inactive: "bg-red-50 text-red-400" };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[v] || ""}`}>{v}</span>;
}

// ── Business Overview Tab ─────────────────────────────────────────────────────
function BusinessOverview() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/analytics/business-overview"] });

  if (isLoading) return <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Revenue This Month" value={fmt$(data.revenueThisMonth)} sub={`${data.ordersThisMonth} orders`} icon={DollarSign} trend={data.revenueGrowthPct} color="green" />
        <KpiCard label="Revenue Last Month" value={fmt$(data.revenueLastMonth)} sub={`${data.ordersLastMonth} orders`} icon={TrendingUp} color="blue" />
        <KpiCard label="Open Orders (Pipeline)" value={data.openOrders.count.toString()} sub={fmt$(data.openOrders.value) + " value"} icon={Package} color="purple" />
        <KpiCard label="Stock Alerts" value={data.stockAlertCount.toString()} sub="products need attention" icon={AlertTriangle} color="orange" />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top Customers (Last 90 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.topCustomers} layout="vertical" margin={{ left: 0, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="company_name" tick={{ fontSize: 10 }} width={110} />
                <Tooltip formatter={(v: any) => fmt$(v)} />
                <Bar dataKey="revenue_90d" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Revenue by Product Category (90 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={data.categoryRevenue} dataKey="revenue" nameKey="category" cx="50%" cy="50%" outerRadius={80} label={({ category, percent }) => `${category} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {data.categoryRevenue.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: any) => fmt$(v)} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {data.dueSoonCustomers.length > 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <Zap className="w-4 h-4" /> Customers Expected to Order in Next 14 Days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 gap-3">
              {data.dueSoonCustomers.map((c: any) => (
                <div key={c.company_name} className="flex items-center justify-between bg-white dark:bg-gray-900 rounded-lg p-3 border">
                  <div>
                    <p className="font-medium text-sm">{c.company_name}</p>
                    <p className="text-xs text-muted-foreground">Avg interval: {c.avg_interval} days</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium text-amber-600">Due {format(parseISO(c.next_expected), "d MMM")}</p>
                    <p className="text-xs text-muted-foreground">Last: {format(parseISO(c.last_order), "d MMM")}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Stock Forecast Tab ────────────────────────────────────────────────────────
function StockForecast() {
  const { data, isLoading } = useQuery<any[]>({ queryKey: ["/api/analytics/stock-forecast"] });
  const [filter, setFilter] = useState<"all" | "critical" | "fast" | "slow">("all");

  if (isLoading) return <Skeleton className="h-96" />;
  if (!data) return null;

  const filtered = filter === "all" ? data
    : filter === "critical" ? data.filter(p => p.days_remaining !== null && p.days_remaining <= 30)
    : data.filter(p => p.velocity === filter);

  const criticalCount = data.filter(p => p.days_remaining !== null && p.days_remaining <= 14).length;
  const warningCount = data.filter(p => p.days_remaining !== null && p.days_remaining > 14 && p.days_remaining <= 30).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Critical (≤14 days)" value={criticalCount.toString()} sub="immediate action needed" icon={AlertTriangle} color="red" />
        <KpiCard label="Warning (≤30 days)" value={warningCount.toString()} sub="plan reorder now" icon={Clock} color="orange" />
        <KpiCard label="Fast Moving" value={data.filter(p => p.velocity === "fast").length.toString()} sub="products" icon={Zap} color="green" />
        <KpiCard label="Slow Moving" value={data.filter(p => p.velocity === "slow").length.toString()} sub="review utilisation" icon={Activity} color="blue" />
      </div>

      <div className="flex gap-2 flex-wrap">
        {(["all", "critical", "fast", "slow"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === f ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}>
            {f === "all" ? "All Products" : f === "critical" ? "⚠ Critical (≤30d)" : f.charAt(0).toUpperCase() + f.slice(1) + " Moving"}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Product</th>
                  <th className="text-left p-3 font-medium">Category</th>
                  <th className="text-right p-3 font-medium">Available</th>
                  <th className="text-right p-3 font-medium">Reserved</th>
                  <th className="text-right p-3 font-medium">Sold 90d</th>
                  <th className="text-right p-3 font-medium">Avg/Day</th>
                  <th className="text-right p-3 font-medium">Days Left</th>
                  <th className="text-right p-3 font-medium">Reorder Qty</th>
                  <th className="text-center p-3 font-medium">Velocity</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => {
                  const daysLeft = p.days_remaining !== null ? parseInt(p.days_remaining) : null;
                  const rowBg = daysLeft !== null && daysLeft <= 14 ? "bg-red-50 dark:bg-red-950/10"
                    : daysLeft !== null && daysLeft <= 30 ? "bg-amber-50 dark:bg-amber-950/10" : "";
                  return (
                    <tr key={p.id} className={`border-b hover:bg-muted/30 ${rowBg}`}>
                      <td className="p-3 font-medium">{p.name}</td>
                      <td className="p-3 text-muted-foreground">{p.category || "—"}</td>
                      <td className="p-3 text-right">{p.available_stock.toLocaleString()}</td>
                      <td className="p-3 text-right text-amber-600">{p.reserved_stock.toLocaleString()}</td>
                      <td className="p-3 text-right">{p.qty_sold_90d.toLocaleString()}</td>
                      <td className="p-3 text-right">{parseFloat(p.avg_daily_usage).toFixed(1)}</td>
                      <td className="p-3 text-right font-medium">
                        {daysLeft !== null ? (
                          <span className={daysLeft <= 14 ? "text-red-600 font-bold" : daysLeft <= 30 ? "text-amber-600" : "text-green-600"}>
                            {daysLeft}d
                          </span>
                        ) : "—"}
                      </td>
                      <td className="p-3 text-right text-blue-600 font-medium">
                        {p.suggested_reorder_qty > 0 ? p.suggested_reorder_qty.toLocaleString() : "—"}
                      </td>
                      <td className="p-3 text-center"><VelocityBadge v={p.velocity} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && <p className="text-center text-muted-foreground py-8 text-sm">No products match this filter.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Customer Patterns Tab ─────────────────────────────────────────────────────
function CustomerPatterns() {
  const { data, isLoading } = useQuery<any[]>({ queryKey: ["/api/analytics/customer-patterns"] });

  if (isLoading) return <Skeleton className="h-96" />;
  if (!data) return null;

  const dueSoon = data.filter(c => c.is_due_soon);
  const overdue = data.filter(c => parseInt(c.days_since_last_order) > parseInt(c.avg_interval_days) + 10);
  const upcoming = data.filter(c => !c.is_due_soon && !overdue.includes(c));

  const sections = [
    { label: "Due Now (within ±10 days)", customers: dueSoon, color: "amber" },
    { label: "Overdue — No Recent Order", customers: overdue, color: "red" },
    { label: "Upcoming Orders", customers: upcoming, color: "blue" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Predictable Customers" value={data.length.toString()} sub="with order patterns" icon={Users} color="blue" />
        <KpiCard label="Due for Order Now" value={dueSoon.length.toString()} sub="follow up today" icon={Zap} color="amber" />
        <KpiCard label="Overdue Customers" value={overdue.length.toString()} sub="past expected date" icon={AlertTriangle} color="red" />
        <KpiCard label="Upcoming (Next 30d)" value={upcoming.filter(c => {
          try { return new Date(c.next_expected_order) <= new Date(Date.now() + 30 * 86400000); } catch { return false; }
        }).length.toString()} sub="predicted orders" icon={TrendingUp} color="green" />
      </div>

      {sections.map(({ label, customers, color }) => customers.length > 0 && (
        <Card key={label} className={color === "amber" ? "border-amber-200" : color === "red" ? "border-red-200" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              {color === "amber" && <Zap className="w-4 h-4 text-amber-500" />}
              {color === "red" && <AlertTriangle className="w-4 h-4 text-red-500" />}
              {color === "blue" && <Clock className="w-4 h-4 text-blue-500" />}
              {label}
              <Badge variant="secondary">{customers.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th className="text-left p-2 font-medium">Customer</th>
                    <th className="text-right p-2 font-medium">Avg Interval</th>
                    <th className="text-right p-2 font-medium">Last Order</th>
                    <th className="text-right p-2 font-medium">Days Since</th>
                    <th className="text-right p-2 font-medium">Next Expected</th>
                    <th className="text-right p-2 font-medium">Avg Order Value</th>
                    <th className="text-right p-2 font-medium">Total Orders</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.slice(0, 25).map((c: any) => (
                    <tr key={c.company_id} className="border-b hover:bg-muted/20">
                      <td className="p-2 font-medium">{c.company_name}</td>
                      <td className="p-2 text-right text-muted-foreground">{c.avg_interval_days}d</td>
                      <td className="p-2 text-right">{c.last_order_date ? format(parseISO(c.last_order_date), "d MMM yy") : "—"}</td>
                      <td className="p-2 text-right">{c.days_since_last_order}d</td>
                      <td className="p-2 text-right font-medium">
                        {c.next_expected_order ? (
                          <span className={c.is_due_soon ? "text-amber-600 font-bold" : ""}>
                            {format(parseISO(c.next_expected_order), "d MMM yy")}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="p-2 text-right">{fmt$(parseFloat(c.avg_order_value))}</td>
                      <td className="p-2 text-right">{c.total_orders}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Revenue Forecast Tab ──────────────────────────────────────────────────────
function RevenueForecast() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/analytics/revenue-forecast"] });

  if (isLoading) return <Skeleton className="h-96" />;
  if (!data) return null;

  const lastMonth = data.monthly[data.monthly.length - 1];
  const projected = data.confirmedThisMonth + data.avgSameMonthRevenue * 0.6;
  const conservative = data.confirmedThisMonth + data.avgSameMonthRevenue * 0.4;
  const bestCase = data.confirmedThisMonth + data.avgSameMonthRevenue * 0.85;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Confirmed This Month" value={fmt$(data.confirmedThisMonth)} sub="from active orders" icon={CheckCircle} color="green" />
        <KpiCard label="Projected (Base)" value={fmt$(projected)} sub="confirmed + historical avg" icon={TrendingUp} color="blue" />
        <KpiCard label="Conservative Estimate" value={fmt$(conservative)} sub="lower scenario" icon={TrendingDown} color="orange" />
        <KpiCard label="Best Case" value={fmt$(bestCase)} sub="optimistic scenario" icon={Zap} color="purple" />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Monthly Revenue — Last 24 Months</CardTitle>
          <CardDescription>Historical revenue with trend</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data.monthly}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tickFormatter={(v) => v.slice(5)} tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any) => [fmt$(v), "Revenue"]} labelFormatter={(l) => `Month: ${l}`} />
              <Area type="monotone" dataKey="revenue" stroke="#6366f1" fill="url(#revGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Monthly Order Volume</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.monthly}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tickFormatter={(v) => v.slice(5)} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="order_count" fill="#8b5cf6" radius={[3, 3, 0, 0]} name="Orders" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top Products by Revenue (90 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {data.topProducts.map((p: any, i: number) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: COLORS[i % COLORS.length] }}>{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.total_qty} units</p>
                  </div>
                  <p className="text-sm font-semibold">{fmt$(parseFloat(p.total_revenue))}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-blue-50 dark:bg-blue-950/10 border-blue-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 text-blue-700 dark:text-blue-400">
            <Brain className="w-4 h-4" /> Revenue Forecast Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-3 gap-4 text-sm">
            <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border">
              <p className="font-semibold text-blue-600 mb-1">Conservative</p>
              <p className="text-2xl font-bold">{fmt$(conservative)}</p>
              <p className="text-xs text-muted-foreground mt-1">Confirmed ({fmt$(data.confirmedThisMonth)}) + 40% of historical average ({fmt$(data.avgSameMonthRevenue)})</p>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-blue-300">
              <p className="font-semibold text-blue-700 mb-1">Base Projection</p>
              <p className="text-2xl font-bold">{fmt$(projected)}</p>
              <p className="text-xs text-muted-foreground mt-1">Confirmed + 60% of historical average (3-year same month)</p>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border">
              <p className="font-semibold text-green-600 mb-1">Best Case</p>
              <p className="text-2xl font-bold">{fmt$(bestCase)}</p>
              <p className="text-xs text-muted-foreground mt-1">Confirmed + 85% of historical average (strong repeat orders)</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Order Efficiency Tab ──────────────────────────────────────────────────────
function OrderEfficiency() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/analytics/order-efficiency"] });

  if (isLoading) return <Skeleton className="h-96" />;
  if (!data) return null;

  const statusColors: Record<string, string> = {
    new: "#6366f1", confirmed: "#8b5cf6", in_production: "#06b6d4",
    ready: "#10b981", dispatched: "#f59e0b", completed: "#22c55e", cancelled: "#ef4444",
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Avg Completion Time" value={data.completion?.avg_completion_days ? `${data.completion.avg_completion_days}d` : "—"} sub="order entry to dispatch" icon={Clock} color="blue" />
        <KpiCard label="Fastest Completion" value={data.completion?.min_days !== null ? `${data.completion.min_days}d` : "—"} sub="best case" icon={Zap} color="green" />
        <KpiCard label="Slowest Completion" value={data.completion?.max_days !== null ? `${data.completion.max_days}d` : "—"} sub="longest case" icon={AlertTriangle} color="orange" />
        <KpiCard label="Completed (90 Days)" value={data.completion?.completed_count?.toString() || "0"} sub="dispatched/completed" icon={CheckCircle} color="green" />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Weekly Order Volume & Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.weeklyVolume}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" tickFormatter={(v) => v.slice(5)} tick={{ fontSize: 10 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any, name: any) => name === "revenue" ? [fmt$(v), "Revenue"] : [v, "Orders"]} />
                <Legend />
                <Bar yAxisId="left" dataKey="order_count" fill="#6366f1" name="Orders" radius={[3, 3, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="revenue" stroke="#10b981" name="revenue" strokeWidth={2} dot={false} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Current Order Pipeline (All Time)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={data.statusDistribution} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={85}
                  label={({ status, count }) => `${status}: ${count}`} labelLine={false}>
                  {data.statusDistribution.map((s: any, i: number) => (
                    <Cell key={i} fill={statusColors[s.status] || COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Order Status Breakdown (Last 90 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-right p-3 font-medium">Count</th>
                  <th className="text-right p-3 font-medium">Avg Age (Days)</th>
                  <th className="p-3">
                    <div className="text-right text-xs text-muted-foreground">volume bar</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.lifecycle.map((row: any) => (
                  <tr key={row.status} className="border-b hover:bg-muted/20">
                    <td className="p-3">
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-medium text-white" style={{ backgroundColor: statusColors[row.status] || "#888" }}>
                        {row.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="p-3 text-right font-semibold">{row.count}</td>
                    <td className="p-3 text-right text-muted-foreground">{row.avg_age_days}d</td>
                    <td className="p-3 w-40">
                      <div className="bg-muted rounded-full h-2">
                        <div className="h-2 rounded-full" style={{ width: `${Math.min(100, (row.count / data.lifecycle[0]?.count) * 100)}%`, backgroundColor: statusColors[row.status] || "#888" }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Stock Intelligence Tab ────────────────────────────────────────────────────
function StockIntelligence() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/analytics/stock-intelligence"] });

  if (isLoading) return <Skeleton className="h-96" />;
  if (!data) return null;

  const { overview, byCategory, movements, alerts } = data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total Physical Stock" value={parseInt(overview.total_physical || 0).toLocaleString()} sub="units on hand" icon={Package} color="blue" />
        <KpiCard label="Reserved Stock" value={parseInt(overview.total_reserved || 0).toLocaleString()} sub="held for active orders" icon={Clock} color="amber" />
        <KpiCard label="Available Stock" value={parseInt(overview.total_available || 0).toLocaleString()} sub="ready to sell" icon={CheckCircle} color="green" />
        <KpiCard label="Below Reorder Point" value={(parseInt(overview.below_reorder || 0) + parseInt(overview.out_of_stock || 0)).toString()} sub="need replenishment" icon={AlertTriangle} color="red" />
      </div>

      {alerts.length > 0 && (
        <Card className="border-red-200 bg-red-50 dark:bg-red-950/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-red-700 dark:text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Stock Alerts — Immediate Attention Required
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr>
                    <th className="text-left p-2 font-medium">Product</th>
                    <th className="text-left p-2 font-medium">Category</th>
                    <th className="text-right p-2 font-medium">Physical</th>
                    <th className="text-right p-2 font-medium">Reserved</th>
                    <th className="text-right p-2 font-medium">Available</th>
                    <th className="text-left p-2 font-medium">Alert</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((a: any) => (
                    <tr key={a.id} className="border-b hover:bg-red-100/40">
                      <td className="p-2 font-medium">{a.name}</td>
                      <td className="p-2 text-muted-foreground">{a.category || "—"}</td>
                      <td className="p-2 text-right">{a.physical_stock}</td>
                      <td className="p-2 text-right text-amber-600">{a.reserved_stock}</td>
                      <td className="p-2 text-right font-bold text-red-600">{a.available_stock}</td>
                      <td className="p-2"><AlertBadge type={a.alert_type} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Stock by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byCategory}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="category" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="total_physical" name="Physical" fill="#6366f1" radius={[3, 3, 0, 0]} />
                <Bar dataKey="total_reserved" name="Reserved" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                <Bar dataKey="total_available" name="Available" fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Stock Movement — Last 12 Weeks</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={movements}>
                <defs>
                  <linearGradient id="inGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="outGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" tickFormatter={(v) => v.slice(5)} tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="inflow" name="Inflow" stroke="#10b981" fill="url(#inGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="outflow" name="Outflow" stroke="#ef4444" fill="url(#outGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Production Planning Tab ───────────────────────────────────────────────────
function ProductionPlanning() {
  const { data, isLoading } = useQuery<any[]>({ queryKey: ["/api/analytics/stock-forecast"] });

  if (isLoading) return <Skeleton className="h-96" />;
  if (!data) return null;

  const fastMoving = data.filter(p => p.velocity === "fast" && p.qty_sold_90d > 0);
  const needProduction = data.filter(p => {
    const days = p.days_remaining !== null ? parseInt(p.days_remaining) : 999;
    return days <= 60 && p.avg_daily_usage > 0;
  });

  const categoryRecommendations = needProduction.reduce((acc: Record<string, { count: number; urgentCount: number; totalReorder: number }>, p) => {
    const cat = p.category || "Other";
    if (!acc[cat]) acc[cat] = { count: 0, urgentCount: 0, totalReorder: 0 };
    acc[cat].count++;
    if (parseInt(p.days_remaining) <= 14) acc[cat].urgentCount++;
    acc[cat].totalReorder += parseInt(p.suggested_reorder_qty || 0);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <Card className="bg-purple-50 dark:bg-purple-950/10 border-purple-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 text-purple-700 dark:text-purple-400">
            <Brain className="w-4 h-4" /> AI Production Recommendations
          </CardTitle>
          <CardDescription>Based on current stock levels, velocity, and 90-day demand trends</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(categoryRecommendations).map(([cat, stats]) => (
              <div key={cat} className="bg-white dark:bg-gray-900 rounded-lg p-4 border">
                <div className="flex items-start justify-between mb-2">
                  <p className="font-semibold text-sm">{cat}</p>
                  {stats.urgentCount > 0 && <Badge variant="destructive" className="text-xs">{stats.urgentCount} urgent</Badge>}
                </div>
                <p className="text-2xl font-bold text-purple-600">{stats.count}</p>
                <p className="text-xs text-muted-foreground">products need production</p>
                <p className="text-xs mt-1 text-blue-600 font-medium">Suggested reorder: {stats.totalReorder.toLocaleString()} units</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Production Priority Queue (Stock Running Low)</CardTitle>
          <CardDescription>Ordered by urgency — products running out soonest</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr>
                  <th className="text-left p-3 font-medium">Priority</th>
                  <th className="text-left p-3 font-medium">Product</th>
                  <th className="text-left p-3 font-medium">Category</th>
                  <th className="text-right p-3 font-medium">Days Left</th>
                  <th className="text-right p-3 font-medium">Daily Usage</th>
                  <th className="text-right p-3 font-medium">Suggested Production Run</th>
                  <th className="text-center p-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {needProduction.slice(0, 30).map((p, i) => {
                  const days = parseInt(p.days_remaining);
                  const priority = days <= 7 ? "🔴 CRITICAL" : days <= 14 ? "🟠 HIGH" : days <= 30 ? "🟡 MEDIUM" : "🟢 PLAN";
                  return (
                    <tr key={p.id} className={`border-b hover:bg-muted/20 ${days <= 14 ? "bg-red-50 dark:bg-red-950/10" : days <= 30 ? "bg-amber-50 dark:bg-amber-950/10" : ""}`}>
                      <td className="p-3 text-sm font-medium">{priority}</td>
                      <td className="p-3 font-medium">{p.name}</td>
                      <td className="p-3 text-muted-foreground">{p.category || "—"}</td>
                      <td className="p-3 text-right font-bold" style={{ color: days <= 14 ? "#ef4444" : days <= 30 ? "#f59e0b" : "#22c55e" }}>{days}d</td>
                      <td className="p-3 text-right">{parseFloat(p.avg_daily_usage).toFixed(1)}/day</td>
                      <td className="p-3 text-right text-blue-600 font-semibold">{parseInt(p.suggested_reorder_qty).toLocaleString()} units</td>
                      <td className="p-3 text-center">
                        <span className={`text-xs px-2 py-1 rounded font-medium ${days <= 14 ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
                          {days <= 14 ? "Schedule Now" : "Schedule Soon"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {needProduction.length === 0 && (
                  <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">All stock levels are healthy — no immediate production required.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Fast-Moving Products — Sustain Production</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={fastMoving.slice(0, 12)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={130} />
              <Tooltip />
              <Bar dataKey="qty_sold_90d" fill="#10b981" radius={[0, 4, 4, 0]} name="Units Sold (90d)" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Intelligence Hub ─────────────────────────────────────────────────────
export default function IntelligenceHub() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Brain className="w-6 h-6 text-purple-600" /> Business Intelligence Hub
        </h1>
        <p className="text-muted-foreground mt-1">Predictive analytics and forward-looking insights to drive smarter decisions</p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="overview" className="flex items-center gap-1.5"><BarChart2 className="w-3.5 h-3.5" /> Overview</TabsTrigger>
          <TabsTrigger value="stock-forecast" className="flex items-center gap-1.5"><Package className="w-3.5 h-3.5" /> Stock Forecast</TabsTrigger>
          <TabsTrigger value="customers" className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Customer Patterns</TabsTrigger>
          <TabsTrigger value="revenue" className="flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5" /> Revenue Forecast</TabsTrigger>
          <TabsTrigger value="efficiency" className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Order Efficiency</TabsTrigger>
          <TabsTrigger value="stock-intel" className="flex items-center gap-1.5"><Activity className="w-3.5 h-3.5" /> Stock Intelligence</TabsTrigger>
          <TabsTrigger value="production" className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" /> Production Planning</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6"><BusinessOverview /></TabsContent>
        <TabsContent value="stock-forecast" className="mt-6"><StockForecast /></TabsContent>
        <TabsContent value="customers" className="mt-6"><CustomerPatterns /></TabsContent>
        <TabsContent value="revenue" className="mt-6"><RevenueForecast /></TabsContent>
        <TabsContent value="efficiency" className="mt-6"><OrderEfficiency /></TabsContent>
        <TabsContent value="stock-intel" className="mt-6"><StockIntelligence /></TabsContent>
        <TabsContent value="production" className="mt-6"><ProductionPlanning /></TabsContent>
      </Tabs>
    </div>
  );
}
