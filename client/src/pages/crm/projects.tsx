import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { FolderKanban, DollarSign, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Deal, Company } from "@shared/schema";

const stages = ["lead", "qualified", "quote_sent", "negotiation", "won", "lost"];
const stageLabels: Record<string, string> = {
  lead: "Lead",
  qualified: "Qualified",
  quote_sent: "Quote Sent",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};

const stageColors: Record<string, string> = {
  lead: "bg-gray-500",
  qualified: "bg-blue-500",
  quote_sent: "bg-yellow-500",
  negotiation: "bg-orange-500",
  won: "bg-green-500",
  lost: "bg-red-500",
};

function formatCurrency(value: string | number | null) {
  if (!value) return "$0";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

export default function ProjectsPage() {
  const [, navigate] = useLocation();

  const { data: deals, isLoading: dealsLoading } = useQuery<Deal[]>({
    queryKey: ["/api/deals"],
  });

  const { data: companies, isLoading: companiesLoading } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const isLoading = dealsLoading || companiesLoading;

  const companyMap = useMemo(() => {
    if (!companies) return new Map<string, Company>();
    const map = new Map<string, Company>();
    companies.forEach((c) => map.set(c.id, c));
    return map;
  }, [companies]);

  const dealsByStage = useMemo(() => {
    const grouped: Record<string, Deal[]> = {};
    stages.forEach((s) => {
      grouped[s] = [];
    });
    if (deals) {
      deals.forEach((deal) => {
        const stage = deal.pipelineStage || "lead";
        if (grouped[stage]) {
          grouped[stage].push(deal);
        }
      });
    }
    return grouped;
  }, [deals]);

  const stats = useMemo(() => {
    if (!deals || deals.length === 0) {
      return { total: 0, pipelineValue: 0, avgDealSize: 0 };
    }
    const total = deals.length;
    const pipelineValue = deals.reduce((sum, d) => {
      const val = d.estimatedValue ? (typeof d.estimatedValue === "string" ? parseFloat(d.estimatedValue) : d.estimatedValue) : 0;
      return sum + val;
    }, 0);
    const avgDealSize = total > 0 ? pipelineValue / total : 0;
    return { total, pipelineValue, avgDealSize };
  }, [deals]);

  const getCompanyName = (deal: Deal) => {
    if (!deal.companyId) return "No company";
    const company = companyMap.get(deal.companyId);
    if (!company) return "No company";
    return company.tradingName || company.legalName || "No company";
  };

  return (
    <div className="space-y-6" data-testid="page-projects">
      <div className="flex items-center gap-3 flex-wrap">
        <PageHeader
          title="Projects"
          description="Deal pipeline as projects"
        />
        <Badge variant="secondary" data-testid="badge-beta">BETA</Badge>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-8 w-32" />
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {stages.map((stage) => (
              <Card key={stage} className="min-w-[280px] flex-shrink-0">
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-20" />
                </CardHeader>
                <CardContent className="space-y-3">
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="stats-summary">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <FolderKanban className="w-4 h-4" />
                  <span>Total Projects</span>
                </div>
                <p className="text-2xl font-semibold" data-testid="stat-total-projects">
                  {stats.total}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <DollarSign className="w-4 h-4" />
                  <span>Pipeline Value</span>
                </div>
                <p className="text-2xl font-semibold" data-testid="stat-pipeline-value">
                  {formatCurrency(stats.pipelineValue)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <TrendingUp className="w-4 h-4" />
                  <span>Avg Deal Size</span>
                </div>
                <p className="text-2xl font-semibold" data-testid="stat-avg-deal-size">
                  {formatCurrency(stats.avgDealSize)}
                </p>
              </CardContent>
            </Card>
          </div>

          <ScrollArea className="w-full" data-testid="kanban-board">
            <div className="flex gap-4 pb-4 min-w-max">
              {stages.map((stage) => (
                <Card key={stage} className="w-[280px] flex-shrink-0 flex flex-col" data-testid={`column-${stage}`}>
                  <CardHeader className="pb-2 flex-shrink-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${stageColors[stage]}`} />
                        <CardTitle className="text-sm">{stageLabels[stage]}</CardTitle>
                      </div>
                      <Badge variant="secondary" className="text-xs" data-testid={`badge-count-${stage}`}>
                        {dealsByStage[stage]?.length || 0}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-3 overflow-y-auto max-h-[600px]">
                    {dealsByStage[stage]?.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <p className="text-xs">No deals</p>
                      </div>
                    ) : (
                      dealsByStage[stage]?.map((deal) => (
                        <Button
                          key={deal.id}
                          variant="ghost"
                          className="w-full h-auto p-0 font-normal justify-start no-default-hover-elevate no-default-active-elevate"
                          onClick={() => navigate(`/deals/${deal.id}`)}
                          data-testid={`card-project-${deal.id}`}
                        >
                          <div className="w-full p-3 rounded-lg border bg-card hover-elevate text-left">
                            <p className="font-medium text-sm mb-2 line-clamp-2" data-testid={`text-deal-name-${deal.id}`}>
                              {deal.dealName}
                            </p>
                            <div className="space-y-1">
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <FolderKanban className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate" data-testid={`text-company-${deal.id}`}>
                                  {getCompanyName(deal)}
                                </span>
                              </div>
                              {deal.estimatedValue && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <DollarSign className="w-3 h-3 flex-shrink-0" />
                                  <span data-testid={`text-value-${deal.id}`}>
                                    {formatCurrency(deal.estimatedValue)}
                                  </span>
                                </div>
                              )}
                              {deal.probability !== null && deal.probability !== undefined && (
                                <div className="mt-2">
                                  <div className="flex justify-between gap-1 text-xs text-muted-foreground mb-1">
                                    <span>Probability</span>
                                    <span data-testid={`text-probability-${deal.id}`}>{deal.probability}%</span>
                                  </div>
                                  <div className="h-1 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className={`h-full ${stageColors[stage]}`}
                                      style={{ width: `${deal.probability}%` }}
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </Button>
                      ))
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </>
      )}
    </div>
  );
}
