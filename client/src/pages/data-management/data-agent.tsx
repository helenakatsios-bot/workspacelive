import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { PageHeader } from "@/components/page-header";
import { Sparkles, AlertTriangle, CheckCircle2, TrendingUp, Bot, ChevronRight, Building2, User } from "lucide-react";
import { Link } from "wouter";
import type { Company, Contact, Order } from "@shared/schema";

type DrilldownItem = {
  id: string;
  name: string;
  detail?: string;
  href: string;
};

type DrilldownConfig = {
  title: string;
  description: string;
  items: DrilldownItem[];
  emptyMessage: string;
  icon: "company" | "contact";
};

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

function InsightCard({ title, count, type, isLoading, onClick }: {
  title: string;
  count: number;
  type: "warning" | "success";
  isLoading: boolean;
  onClick?: () => void;
}) {
  const Icon = type === "warning" ? AlertTriangle : CheckCircle2;
  const color = type === "warning" ? "text-amber-500" : "text-green-500";

  return (
    <Card
      data-testid={`insight-${title.toLowerCase().replace(/\s+/g, "-")}`}
      className={onClick && count > 0 ? "cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all" : ""}
      onClick={onClick && count > 0 ? onClick : undefined}
    >
      <CardContent className="flex items-center gap-4 pt-6">
        <div className={`w-10 h-10 rounded-md flex items-center justify-center flex-shrink-0 ${type === "warning" ? "bg-amber-500/10" : "bg-green-500/10"}`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{title}</p>
          {isLoading ? (
            <Skeleton className="h-4 w-16 mt-1" />
          ) : (
            <p className={`text-lg font-bold ${color}`}>{count}</p>
          )}
        </div>
        {onClick && count > 0 && !isLoading && (
          <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        )}
      </CardContent>
    </Card>
  );
}

function DrilldownSheet({ config, open, onClose }: {
  config: DrilldownConfig | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!config) return null;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{config.title}</SheetTitle>
          <SheetDescription>{config.description}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto mt-4 space-y-2">
          {config.items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">{config.emptyMessage}</p>
          ) : (
            config.items.map((item) => (
              <Link key={item.id} href={item.href} onClick={onClose}>
                <div
                  data-testid={`drilldown-item-${item.id}`}
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 hover:border-primary/40 transition-colors cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                    {config.icon === "company"
                      ? <Building2 className="w-4 h-4 text-muted-foreground" />
                      : <User className="w-4 h-4 text-muted-foreground" />
                    }
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    {item.detail && <p className="text-xs text-muted-foreground truncate">{item.detail}</p>}
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </div>
              </Link>
            ))
          )}
        </div>
        {config.items.length > 0 && (
          <p className="text-xs text-muted-foreground text-center pt-3 border-t">
            {config.items.length} {config.items.length === 1 ? "result" : "results"}
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function DataAgentPage() {
  const [drilldown, setDrilldown] = useState<DrilldownConfig | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

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

  const companiesMissingEmail = companies?.filter(c => !c.emailAddresses || c.emailAddresses.length === 0) ?? [];
  const contactsNoPhone = contacts?.filter(c => !c.phone) ?? [];

  const companiesWithRecentOrders = new Set(
    orders?.filter(o => o.orderDate && new Date(o.orderDate) > cutoff180).map(o => o.companyId) ?? []
  );
  const inactiveCompanies = companies?.filter(c => !companiesWithRecentOrders.has(c.id)) ?? [];
  const companiesNoGrade = companies?.filter(c => !c.clientGrade) ?? [];

  function openDrilldown(config: DrilldownConfig) {
    setDrilldown(config);
    setSheetOpen(true);
  }

  function handleMissingEmail() {
    openDrilldown({
      title: "Companies Missing Email",
      description: `${companiesMissingEmail.length} companies have no email address on file.`,
      icon: "company",
      emptyMessage: "All companies have email addresses.",
      items: companiesMissingEmail.map(c => ({
        id: c.id,
        name: c.tradingName || c.legalName,
        detail: c.billingAddress || c.shippingAddress || "No address on file",
        href: `/companies/${c.id}`,
      })),
    });
  }

  function handleContactsNoPhone() {
    openDrilldown({
      title: "Contacts Without Phone",
      description: `${contactsNoPhone.length} contacts are missing a phone number.`,
      icon: "contact",
      emptyMessage: "All contacts have phone numbers.",
      items: contactsNoPhone.map(c => ({
        id: c.id,
        name: `${c.firstName} ${c.lastName}`.trim() || c.email || "Unnamed contact",
        detail: c.email || "No email on file",
        href: `/contacts/${c.id}`,
      })),
    });
  }

  function handleInactiveCompanies() {
    openDrilldown({
      title: "Inactive Companies (180+ days)",
      description: `${inactiveCompanies.length} companies haven't placed an order in the last 180 days.`,
      icon: "company",
      emptyMessage: "All companies have recent orders.",
      items: inactiveCompanies.map(c => {
        const lastOrder = orders
          ?.filter(o => o.companyId === c.id)
          .sort((a, b) => new Date(b.orderDate!).getTime() - new Date(a.orderDate!).getTime())[0];
        const lastOrderStr = lastOrder
          ? `Last order: ${new Date(lastOrder.orderDate!).toLocaleDateString("en-AU")}`
          : "No orders on record";
        return {
          id: c.id,
          name: c.tradingName || c.legalName,
          detail: lastOrderStr,
          href: `/companies/${c.id}`,
        };
      }),
    });
  }

  function handleNoGrade() {
    openDrilldown({
      title: "Companies Without Grade",
      description: `${companiesNoGrade.length} companies haven't been assigned a client grade.`,
      icon: "company",
      emptyMessage: "All companies have a grade.",
      items: companiesNoGrade.map(c => ({
        id: c.id,
        name: c.tradingName || c.legalName,
        detail: `Total revenue: $${parseFloat(c.totalRevenue || "0").toLocaleString("en-AU", { minimumFractionDigits: 2 })}`,
        href: `/companies/${c.id}`,
      })),
    });
  }

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
          {!isLoading && <p className="text-sm text-muted-foreground">Click any card to see the full list</p>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <InsightCard
            title="Companies Missing Email"
            count={companiesMissingEmail.length}
            type={companiesMissingEmail.length > 0 ? "warning" : "success"}
            isLoading={isLoading}
            onClick={handleMissingEmail}
          />
          <InsightCard
            title="Contacts Without Phone"
            count={contactsNoPhone.length}
            type={contactsNoPhone.length > 0 ? "warning" : "success"}
            isLoading={isLoading}
            onClick={handleContactsNoPhone}
          />
          <InsightCard
            title="Inactive Companies (180+ days)"
            count={inactiveCompanies.length}
            type={inactiveCompanies.length > 0 ? "warning" : "success"}
            isLoading={isLoading}
            onClick={handleInactiveCompanies}
          />
          <InsightCard
            title="Companies Without Grade"
            count={companiesNoGrade.length}
            type={companiesNoGrade.length > 0 ? "warning" : "success"}
            isLoading={isLoading}
            onClick={handleNoGrade}
          />
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

      <DrilldownSheet
        config={drilldown}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}
