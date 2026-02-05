import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { Target, Plus, Building2, User, Calendar, DollarSign, GripVertical } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Deal, Company, Contact } from "@shared/schema";

interface DealWithRelations extends Deal {
  company?: Company;
  contact?: Contact;
}

const stages = [
  { id: "lead", label: "Lead", color: "bg-gray-500" },
  { id: "qualified", label: "Qualified", color: "bg-blue-500" },
  { id: "quote_sent", label: "Quote Sent", color: "bg-yellow-500" },
  { id: "negotiation", label: "Negotiation", color: "bg-orange-500" },
  { id: "won", label: "Won", color: "bg-green-500" },
  { id: "lost", label: "Lost", color: "bg-red-500" },
];

export default function DealsPage() {
  const [, navigate] = useLocation();
  const { canEdit, canViewPricing } = useAuth();
  const [search, setSearch] = useState("");

  const { data: deals, isLoading } = useQuery<DealWithRelations[]>({
    queryKey: ["/api/deals"],
  });

  const updateStageMutation = useMutation({
    mutationFn: async ({ dealId, stage }: { dealId: string; stage: string }) => {
      return apiRequest("PATCH", `/api/deals/${dealId}`, { pipelineStage: stage });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
    },
  });

  const filteredDeals = useMemo(() => {
    if (!deals) return [];
    return deals.filter((deal) =>
      deal.dealName.toLowerCase().includes(search.toLowerCase()) ||
      (deal.company?.tradingName || deal.company?.legalName || "").toLowerCase().includes(search.toLowerCase())
    );
  }, [deals, search]);

  const dealsByStage = useMemo(() => {
    const grouped: Record<string, DealWithRelations[]> = {};
    stages.forEach((stage) => {
      grouped[stage.id] = filteredDeals.filter((deal) => deal.pipelineStage === stage.id);
    });
    return grouped;
  }, [filteredDeals]);

  const formatCurrency = (value: string | number | null) => {
    if (!value) return "-";
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  };

  const handleDragStart = (e: React.DragEvent, dealId: string) => {
    e.dataTransfer.setData("dealId", dealId);
  };

  const handleDrop = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    const dealId = e.dataTransfer.getData("dealId");
    if (dealId && canEdit) {
      updateStageMutation.mutate({ dealId, stage: stageId });
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Deals"
        description="Track your sales pipeline"
        searchPlaceholder="Search deals..."
        searchValue={search}
        onSearchChange={setSearch}
        action={
          canEdit
            ? {
                label: "New Deal",
                onClick: () => navigate("/deals/new"),
                testId: "button-new-deal",
              }
            : undefined
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {stages.map((stage) => (
            <Card key={stage.id}>
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
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 min-h-[500px]">
          {stages.map((stage) => (
            <Card
              key={stage.id}
              className="flex flex-col"
              onDrop={(e) => handleDrop(e, stage.id)}
              onDragOver={handleDragOver}
            >
              <CardHeader className="pb-2 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${stage.color}`} />
                    <CardTitle className="text-sm">{stage.label}</CardTitle>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {dealsByStage[stage.id]?.length || 0}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-3 overflow-y-auto">
                {dealsByStage[stage.id]?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-xs">No deals</p>
                  </div>
                ) : (
                  dealsByStage[stage.id]?.map((deal) => (
                    <div
                      key={deal.id}
                      draggable={canEdit}
                      onDragStart={(e) => handleDragStart(e, deal.id)}
                      onClick={() => navigate(`/deals/${deal.id}`)}
                      className="p-3 rounded-lg border bg-card hover-elevate cursor-pointer"
                      data-testid={`card-deal-${deal.id}`}
                    >
                      {canEdit && (
                        <GripVertical className="w-4 h-4 text-muted-foreground mb-2 cursor-grab" />
                      )}
                      <p className="font-medium text-sm mb-2 line-clamp-2">{deal.dealName}</p>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Building2 className="w-3 h-3" />
                          <span className="truncate">
                            {deal.company?.tradingName || deal.company?.legalName || "No company"}
                          </span>
                        </div>
                        {canViewPricing && deal.estimatedValue && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <DollarSign className="w-3 h-3" />
                            <span>{formatCurrency(deal.estimatedValue)}</span>
                          </div>
                        )}
                        {deal.expectedCloseDate && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="w-3 h-3" />
                            <span>{format(new Date(deal.expectedCloseDate), "MMM d")}</span>
                          </div>
                        )}
                      </div>
                      {deal.probability !== null && deal.probability !== undefined && (
                        <div className="mt-2">
                          <div className="flex justify-between text-xs text-muted-foreground mb-1">
                            <span>Probability</span>
                            <span>{deal.probability}%</span>
                          </div>
                          <div className="h-1 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full ${stage.color}`}
                              style={{ width: `${deal.probability}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
