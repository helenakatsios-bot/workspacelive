import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Ticket, Clock, Award } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { CrmTicket } from "@shared/schema";

interface Company {
  id: string;
  name: string;
}

function HorizontalBar({
  label,
  value,
  max,
  color,
  testId,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  testId: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="space-y-1" data-testid={testId}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground capitalize">{label.replace(/_/g, " ")}</span>
        <span className="font-medium">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-muted">
        <div
          className={`h-2 rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

const statusColors: Record<string, string> = {
  open: "bg-blue-500",
  in_progress: "bg-yellow-500",
  waiting: "bg-orange-500",
  resolved: "bg-green-500",
  closed: "bg-gray-500",
};

const priorityColors: Record<string, string> = {
  urgent: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-green-500",
};

export default function ServiceAnalyticsPage() {
  const { data: tickets, isLoading: ticketsLoading } = useQuery<CrmTicket[]>({
    queryKey: ["/api/crm/tickets"],
  });

  const { data: companies, isLoading: companiesLoading } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const isLoading = ticketsLoading || companiesLoading;

  const analytics = useMemo(() => {
    if (!tickets) return null;

    const total = tickets.length;
    const open = tickets.filter((t) => t.status === "open").length;

    const resolved = tickets.filter((t) => t.resolvedAt);
    const avgResolution =
      resolved.length > 0
        ? Math.round(
            resolved.reduce((sum, t) => {
              const created = new Date(t.createdAt).getTime();
              const resolvedAt = new Date(t.resolvedAt!).getTime();
              return sum + (resolvedAt - created) / (1000 * 60 * 60 * 24);
            }, 0) / resolved.length
          )
        : 0;

    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const byCompany: Record<string, number> = {};

    tickets.forEach((t) => {
      byStatus[t.status] = (byStatus[t.status] || 0) + 1;
      byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
      const cat = t.category || "general";
      byCategory[cat] = (byCategory[cat] || 0) + 1;
      if (t.companyId) {
        byCompany[t.companyId] = (byCompany[t.companyId] || 0) + 1;
      }
    });

    const topCompanies = Object.entries(byCompany)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return { total, open, avgResolution, byStatus, byPriority, byCategory, topCompanies };
  }, [tickets]);

  const companyMap = useMemo(() => {
    if (!companies) return new Map<string, string>();
    return new Map(companies.map((c) => [c.id, c.name]));
  }, [companies]);

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="page-service-analytics">
        <PageHeader title="Service Analytics" description="Service performance metrics and insights" />
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-4 w-32" />
                {Array.from({ length: 3 }).map((_, j) => (
                  <Skeleton key={j} className="h-6 w-full" />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!analytics) return null;

  const summaryCards = [
    { label: "Total Tickets", value: analytics.total, icon: Ticket, testId: "stat-total" },
    { label: "Open Tickets", value: analytics.open, icon: Ticket, testId: "stat-open" },
    { label: "Avg Resolution (days)", value: analytics.avgResolution, icon: Clock, testId: "stat-avg-resolution" },
    { label: "CSAT Score", value: "4.2 / 5", icon: Award, testId: "stat-csat" },
  ];

  const maxStatus = Math.max(...Object.values(analytics.byStatus), 1);
  const maxPriority = Math.max(...Object.values(analytics.byPriority), 1);
  const maxCategory = Math.max(...Object.values(analytics.byCategory), 1);
  const maxCompany = analytics.topCompanies.length > 0 ? analytics.topCompanies[0][1] : 1;

  return (
    <div className="space-y-6" data-testid="page-service-analytics">
      <PageHeader
        title="Service Analytics"
        description="Service performance metrics and insights"
      />

      <div className="grid gap-4 md:grid-cols-4">
        {summaryCards.map((s) => (
          <Card key={s.testId} data-testid={s.testId}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {s.label}
              </CardTitle>
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid={`text-${s.testId}-value`}>
                {s.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card data-testid="chart-tickets-by-status">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Tickets by Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(analytics.byStatus).map(([status, count]) => (
              <HorizontalBar
                key={status}
                label={status}
                value={count}
                max={maxStatus}
                color={statusColors[status] || "bg-muted-foreground"}
                testId={`bar-status-${status}`}
              />
            ))}
          </CardContent>
        </Card>

        <Card data-testid="chart-tickets-by-priority">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Tickets by Priority
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(analytics.byPriority).map(([priority, count]) => (
              <HorizontalBar
                key={priority}
                label={priority}
                value={count}
                max={maxPriority}
                color={priorityColors[priority] || "bg-muted-foreground"}
                testId={`bar-priority-${priority}`}
              />
            ))}
          </CardContent>
        </Card>

        <Card data-testid="chart-tickets-by-category">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Tickets by Category
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(analytics.byCategory).map(([category, count]) => (
              <HorizontalBar
                key={category}
                label={category}
                value={count}
                max={maxCategory}
                color="bg-blue-500"
                testId={`bar-category-${category}`}
              />
            ))}
          </CardContent>
        </Card>

        <Card data-testid="chart-top-companies">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Top Companies by Ticket Count
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {analytics.topCompanies.length === 0 ? (
              <p className="text-sm text-muted-foreground">No company data available</p>
            ) : (
              analytics.topCompanies.map(([companyId, count]) => (
                <HorizontalBar
                  key={companyId}
                  label={companyMap.get(companyId) || companyId}
                  value={count}
                  max={maxCompany}
                  color="bg-violet-500"
                  testId={`bar-company-${companyId}`}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
