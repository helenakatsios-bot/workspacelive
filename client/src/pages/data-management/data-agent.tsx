import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { Sparkles, AlertTriangle, CheckCircle2, TrendingUp, Bot } from "lucide-react";
import { Link } from "wouter";
import type { Company, Contact, Order } from "@shared/schema";

function StatCard({ title, value, icon: Icon, isLoading }: {
  title: string;
  value: string | number;
  icon: any;
  isLoading: boolean;
}) {
  return (
    <Card data-testid={`stat-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
          <Icon className="w-4 h-4 text-primary" />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-8 w-20" /> : <div className="text-2xl font-bold">{value}</div>}
      </CardContent>
    </Card>
  );
}

function InsightCard({ title, count, type, isLoading }: {
  title: string;
  count: number;
  type: "warning" | "success";
  isLoading: boolean;
}) {
  const Icon = type === "warning" ? AlertTriangle : CheckCircle2;
  const color = type === "warning" ? "text-amber-500" : "text-green-500";

  return (
    <Card data-testid={`insight-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="flex items-center gap-4 pt-6">
        <div className={`w-10 h-10 rounded-md flex items-center justify-center flex-shrink-0 ${type === "warning" ? "bg-amber-500/10" : "bg-green-500/10"}`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          {isLoading ? (
            <Skeleton className="h-4 w-16 mt-1" />
          ) : (
            <p className={`text-lg font-bold ${color}`}>{count}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DataAgentPage() {
  const { data: companies, isLoading: loadingCompanies } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const { data: contacts, isLoading: loadingContacts } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const { data: orders, isLoading: loadingOrders } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
  });

  const isLoading = loadingCompanies || loadingContacts || loadingOrders;

  const totalRevenue = orders?.reduce((sum, o) => sum + parseFloat(o.total || "0"), 0) ?? 0;

  const now = new Date();
  const cutoff180 = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

  const missingEmail = companies?.filter(c => !c.emailAddresses || c.emailAddresses.length === 0).length ?? 0;
  const contactsNoPhone = contacts?.filter(c => !c.phone).length ?? 0;

  const companiesWithRecentOrders = new Set(
    orders?.filter(o => o.orderDate && new Date(o.orderDate) > cutoff180).map(o => o.companyId) ?? []
  );
  const inactiveCompanies = companies?.filter(c => !companiesWithRecentOrders.has(c.id)).length ?? 0;

  const noGrade = companies?.filter(c => !c.clientGrade).length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Agent"
        description="AI-powered data analysis and insights"
      >
        <Link href="/service/customer-agent">
          <Button data-testid="button-ask-millie">
            <Bot className="w-4 h-4 mr-2" />
            Get Help from Millie
          </Button>
        </Link>
      </PageHeader>

      <div>
        <h2 className="text-lg font-semibold mb-3" data-testid="text-data-overview">Data Overview</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Total Companies" value={companies?.length ?? 0} icon={TrendingUp} isLoading={isLoading} />
          <StatCard title="Total Contacts" value={contacts?.length ?? 0} icon={TrendingUp} isLoading={isLoading} />
          <StatCard title="Total Orders" value={orders?.length ?? 0} icon={TrendingUp} isLoading={isLoading} />
          <StatCard title="Total Revenue" value={`$${totalRevenue.toLocaleString("en-AU", { minimumFractionDigits: 2 })}`} icon={TrendingUp} isLoading={isLoading} />
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <h2 className="text-lg font-semibold" data-testid="text-quick-insights">Quick Insights</h2>
          <Badge variant="secondary">
            <Sparkles className="w-3 h-3 mr-1" />
            Auto-computed
          </Badge>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <InsightCard title="Companies Missing Email" count={missingEmail} type={missingEmail > 0 ? "warning" : "success"} isLoading={isLoading} />
          <InsightCard title="Contacts Without Phone" count={contactsNoPhone} type={contactsNoPhone > 0 ? "warning" : "success"} isLoading={isLoading} />
          <InsightCard title="Inactive Companies (180+ days)" count={inactiveCompanies} type={inactiveCompanies > 0 ? "warning" : "success"} isLoading={isLoading} />
          <InsightCard title="Companies Without Grade" count={noGrade} type={noGrade > 0 ? "warning" : "success"} isLoading={isLoading} />
        </div>
      </div>

      <Card data-testid="card-millie-cta">
        <CardContent className="flex flex-col sm:flex-row items-center gap-4 pt-6">
          <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Bot className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1 text-center sm:text-left">
            <h3 className="font-semibold">Need deeper analysis?</h3>
            <p className="text-sm text-muted-foreground">
              Ask Millie to analyze trends, find patterns, or generate reports from your CRM data.
            </p>
          </div>
          <Link href="/service/customer-agent">
            <Button variant="outline" data-testid="button-ask-millie-card">
              <Sparkles className="w-4 h-4 mr-2" />
              Ask Millie
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
