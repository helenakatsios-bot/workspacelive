import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { format } from "date-fns";
import { ArrowLeft, Edit, Building2, User, Calendar, DollarSign, Percent, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import type { Deal, Company, Contact } from "@shared/schema";

interface DealWithRelations extends Deal {
  company?: Company;
  contact?: Contact;
}

const stageColors: Record<string, string> = {
  lead: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
  qualified: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  quote_sent: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  negotiation: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  won: "bg-green-500/10 text-green-700 dark:text-green-400",
  lost: "bg-red-500/10 text-red-700 dark:text-red-400",
};

const stageLabels: Record<string, string> = {
  lead: "Lead",
  qualified: "Qualified",
  quote_sent: "Quote Sent",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};

export default function DealDetailPage() {
  const [, params] = useRoute("/deals/:id");
  const [, navigate] = useLocation();
  const { canEdit } = useAuth();

  const { data: deal, isLoading } = useQuery<DealWithRelations>({
    queryKey: ["/api/deals", params?.id],
    enabled: !!params?.id,
  });

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

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold mb-2">Deal not found</h2>
        <Button variant="outline" onClick={() => navigate("/deals")}>Back to Deals</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/deals")} data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-deal-name">{deal.dealName}</h1>
            <p className="text-sm text-muted-foreground">
              Created {format(new Date(deal.createdAt), "MMM d, yyyy")}
            </p>
          </div>
        </div>
        {canEdit && (
          <Button onClick={() => navigate(`/deals/${params!.id}/edit`)} data-testid="button-edit-deal">
            <Edit className="w-4 h-4 mr-2" />
            Edit
          </Button>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Deal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Target className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Stage</p>
                <Badge className={stageColors[deal.pipelineStage] || stageColors.lead}>
                  {stageLabels[deal.pipelineStage] || deal.pipelineStage}
                </Badge>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Estimated Value</p>
                <p className="font-medium">{formatCurrency(deal.estimatedValue)}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Percent className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Probability</p>
                <p className="font-medium">{deal.probability ?? 0}%</p>
              </div>
            </div>

            {deal.expectedCloseDate && (
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Expected Close</p>
                  <p className="font-medium">{format(new Date(deal.expectedCloseDate), "MMM d, yyyy")}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Related</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className="flex items-center gap-3 cursor-pointer hover:bg-muted/50 -mx-2 px-2 py-1 rounded"
              onClick={() => deal.company && navigate(`/companies/${deal.companyId}`)}
            >
              <Building2 className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Company</p>
                <p className="font-medium">
                  {deal.company?.tradingName || deal.company?.legalName || "Unknown"}
                </p>
              </div>
            </div>

            {deal.contact && (
              <div className="flex items-center gap-3">
                <User className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Contact</p>
                  <p className="font-medium">
                    {deal.contact.firstName} {deal.contact.lastName}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
