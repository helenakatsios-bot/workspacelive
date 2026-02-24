import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Mail, Users, TrendingUp, Target, Award, Calendar } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function MarketingCampaignsPage() {
  const { data: companies, isLoading: companiesLoading } = useQuery<any[]>({ queryKey: ["/api/companies"] });
  const { data: orders, isLoading: ordersLoading } = useQuery<any[]>({ queryKey: ["/api/orders"] });

  const isLoading = companiesLoading || ordersLoading;

  const stats = useMemo(() => {
    if (!companies || !orders) {
      return { totalCompanies: 0, activeCompanies: 0, avgOrderValue: 0, reEngagement: 0, gradeACompanies: 0 };
    }

    const now = new Date();
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const companyLastOrder = new Map<number, Date>();
    orders.forEach((order: any) => {
      if (order.companyId && order.createdAt) {
        const orderDate = new Date(order.createdAt);
        const existing = companyLastOrder.get(order.companyId);
        if (!existing || orderDate > existing) {
          companyLastOrder.set(order.companyId, orderDate);
        }
      }
    });

    const activeCompanies = Array.from(companyLastOrder.values()).filter(d => d >= sixMonthsAgo).length;
    const reEngagement = Array.from(companyLastOrder.entries()).filter(([_, d]) => d < threeMonthsAgo).length;

    const orderValues = orders
      .map((o: any) => parseFloat(o.totalAmount || o.total || "0"))
      .filter((v: number) => v > 0);
    const avgOrderValue = orderValues.length > 0
      ? orderValues.reduce((a: number, b: number) => a + b, 0) / orderValues.length
      : 0;

    const gradeACompanies = companies.filter((c: any) => c.grade === "A" || c.grade === "a").length;

    return {
      totalCompanies: companies.length,
      activeCompanies,
      avgOrderValue,
      reEngagement,
      gradeACompanies,
    };
  }, [companies, orders]);

  const overviewCards = [
    { title: "Total Companies", value: stats.totalCompanies, icon: Users, description: "In your database" },
    { title: "Active Companies", value: stats.activeCompanies, icon: TrendingUp, description: "Orders in last 6 months" },
    { title: "Average Order Value", value: `$${stats.avgOrderValue.toFixed(2)}`, icon: Target, description: "Across all orders" },
    { title: "Re-engagement", value: stats.reEngagement, icon: Mail, description: "Inactive 3+ months" },
  ];

  const campaignTypes = [
    {
      id: "re-engagement",
      title: "Re-engagement Campaign",
      description: "Reach out to customers who haven't ordered in 3+ months to bring them back.",
      icon: Mail,
      audienceCount: stats.reEngagement,
      audienceLabel: "inactive customers",
      actionLabel: "View Segments",
      actionLink: "/crm/segments",
      variant: "default" as const,
    },
    {
      id: "product-launch",
      title: "New Product Launch",
      description: "Announce new products and collections to your entire customer base.",
      icon: Target,
      audienceCount: stats.totalCompanies,
      audienceLabel: "total customers",
      actionLabel: "View Products",
      actionLink: "/products",
      variant: "secondary" as const,
    },
    {
      id: "price-update",
      title: "Price List Update",
      description: "Notify customers about updated pricing, seasonal adjustments, or new price tiers.",
      icon: TrendingUp,
      audienceCount: stats.activeCompanies,
      audienceLabel: "active customers",
      actionLabel: "View Price Lists",
      actionLink: "/admin/price-lists",
      variant: "secondary" as const,
    },
    {
      id: "seasonal-promo",
      title: "Seasonal Promotion",
      description: "Create holiday and seasonal offers to drive sales during peak periods.",
      icon: Calendar,
      audienceCount: stats.totalCompanies,
      audienceLabel: "all customers",
      actionLabel: "Create Offer",
      actionLink: "/quotes",
      variant: "secondary" as const,
    },
    {
      id: "customer-appreciation",
      title: "Customer Appreciation",
      description: "Thank your top-tier Grade A customers with exclusive offers and recognition.",
      icon: Award,
      audienceCount: stats.gradeACompanies,
      audienceLabel: "Grade A customers",
      actionLabel: "View Top Customers",
      actionLink: "/companies",
      variant: "secondary" as const,
    },
  ];

  return (
    <div className="space-y-6" data-testid="page-campaigns">
      <PageHeader
        title="Campaigns"
        description="Marketing campaigns and customer outreach"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {overviewCards.map((card) => (
          <Card key={card.title} data-testid={`card-stat-${card.title.toLowerCase().replace(/\s+/g, "-")}`}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
              <card.icon className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold" data-testid={`text-stat-${card.title.toLowerCase().replace(/\s+/g, "-")}`}>
                  {card.value}
                </div>
              )}
              <p className="text-xs text-muted-foreground">{card.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4" data-testid="text-campaign-types-heading">Campaign Types</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaignTypes.map((campaign) => (
            <Card key={campaign.id} data-testid={`card-campaign-${campaign.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center">
                      <campaign.icon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <CardTitle className="text-base">{campaign.title}</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <CardDescription>{campaign.description}</CardDescription>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  {isLoading ? (
                    <Skeleton className="h-5 w-24" />
                  ) : (
                    <Badge variant="secondary" data-testid={`badge-audience-${campaign.id}`}>
                      {campaign.audienceCount} {campaign.audienceLabel}
                    </Badge>
                  )}
                  <Link href={campaign.actionLink}>
                    <Button variant="outline" size="sm" data-testid={`button-action-${campaign.id}`}>
                      {campaign.actionLabel}
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}