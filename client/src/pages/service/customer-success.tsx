import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Award,
  AlertTriangle,
  TrendingDown,
  Clock,
  Send,
  Loader2,
  ArrowUpDown,
  Filter,
  Building2,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Link } from "wouter";

interface CustomerMetric {
  company_id: string;
  legal_name: string;
  trading_name: string | null;
  client_grade: string | null;
  total_revenue: number;
  total_orders: number;
  first_order_date: string | null;
  most_recent_order: string | null;
  avg_days_between_orders: number | null;
  days_since_last_order: number | null;
}

type SortField = "days_since_last_order" | "avg_days_between_orders" | "total_orders" | "total_revenue" | "legal_name";
type SortDir = "asc" | "desc";

export default function CustomerSuccessPage() {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("days_since_last_order");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data: metrics = [], isLoading } = useQuery<CustomerMetric[]>({
    queryKey: ["/api/customer-success/metrics"],
  });

  const sendAlert = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/customer-success/send-inactivity-alert", { days: 60 });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: data.sent ? "Alert Sent" : "Info",
        description: data.message,
        variant: data.sent ? "default" : "destructive",
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to send alert", variant: "destructive" });
    },
  });

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir(field === "legal_name" ? "asc" : "desc");
    }
  };

  const getHealthStatus = (m: CustomerMetric): "healthy" | "at_risk" | "inactive" => {
    if (m.days_since_last_order === null || m.days_since_last_order === undefined) return "inactive";
    if (m.days_since_last_order >= 60) return "inactive";
    if (m.days_since_last_order >= 30) return "at_risk";
    return "healthy";
  };

  const filtered = metrics
    .filter((m) => {
      const name = (m.trading_name || m.legal_name).toLowerCase();
      if (search && !name.includes(search.toLowerCase())) return false;
      if (gradeFilter !== "all" && m.client_grade !== gradeFilter) return false;
      if (statusFilter !== "all") {
        const health = getHealthStatus(m);
        if (statusFilter !== health) return false;
      }
      return true;
    })
    .sort((a, b) => {
      let aVal: any, bVal: any;
      switch (sortField) {
        case "legal_name":
          aVal = (a.trading_name || a.legal_name).toLowerCase();
          bVal = (b.trading_name || b.legal_name).toLowerCase();
          break;
        case "days_since_last_order":
          aVal = a.days_since_last_order ?? -1;
          bVal = b.days_since_last_order ?? -1;
          break;
        case "avg_days_between_orders":
          aVal = a.avg_days_between_orders ?? -1;
          bVal = b.avg_days_between_orders ?? -1;
          break;
        default:
          aVal = (a as any)[sortField] ?? 0;
          bVal = (b as any)[sortField] ?? 0;
      }
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

  const inactiveCount = metrics.filter((m) => getHealthStatus(m) === "inactive").length;
  const atRiskCount = metrics.filter((m) => getHealthStatus(m) === "at_risk").length;
  const healthyCount = metrics.filter((m) => getHealthStatus(m) === "healthy").length;

  const formatDate = (d: string | null) => {
    if (!d) return "-";
    return new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  };

  const formatDays = (d: number | null) => {
    if (d === null || d === undefined) return "-";
    return `${Math.round(d)}d`;
  };

  const formatRevenue = (r: number) => {
    if (!r) return "$0";
    return `$${Number(r).toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  return (
    <div className="space-y-6 p-6" data-testid="customer-success-page">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <PageHeader
          title="Customer Success"
          description="Track ordering patterns and identify customers who need attention"
        />
        {isAdmin && (
          <Button
            onClick={() => sendAlert.mutate()}
            disabled={sendAlert.isPending}
            data-testid="button-send-inactivity-alert"
          >
            {sendAlert.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            Send 60-Day Alert
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Healthy</CardTitle>
            <Award className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600" data-testid="text-healthy-count">{healthyCount}</div>
            <p className="text-xs text-muted-foreground">Ordered within 30 days</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">At Risk</CardTitle>
            <Clock className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600" data-testid="text-atrisk-count">{atRiskCount}</div>
            <p className="text-xs text-muted-foreground">30-60 days since last order</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inactive</CardTitle>
            <AlertTriangle className="w-4 h-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600" data-testid="text-inactive-count">{inactiveCount}</div>
            <p className="text-xs text-muted-foreground">60+ days since last order</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base">Customer Ordering Patterns</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                placeholder="Search customers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-48"
                data-testid="input-search-customers"
              />
              <Select value={gradeFilter} onValueChange={setGradeFilter}>
                <SelectTrigger className="w-32" data-testid="select-grade-filter">
                  <Filter className="w-3.5 h-3.5 mr-1" />
                  <SelectValue placeholder="Grade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Grades</SelectItem>
                  <SelectItem value="A">A Grade</SelectItem>
                  <SelectItem value="B">B Grade</SelectItem>
                  <SelectItem value="C">C Grade</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32" data-testid="select-status-filter">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="healthy">Healthy</SelectItem>
                  <SelectItem value="at_risk">At Risk</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="text-sm text-muted-foreground">No customers match your filters</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <Button variant="ghost" size="sm" onClick={() => toggleSort("legal_name")} data-testid="sort-name">
                        Customer <ArrowUpDown className="w-3 h-3 ml-1" />
                      </Button>
                    </TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>
                      <Button variant="ghost" size="sm" onClick={() => toggleSort("total_orders")} data-testid="sort-orders">
                        Orders <ArrowUpDown className="w-3 h-3 ml-1" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button variant="ghost" size="sm" onClick={() => toggleSort("total_revenue")} data-testid="sort-revenue">
                        Revenue <ArrowUpDown className="w-3 h-3 ml-1" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button variant="ghost" size="sm" onClick={() => toggleSort("avg_days_between_orders")} data-testid="sort-avg-gap">
                        Avg Gap <ArrowUpDown className="w-3 h-3 ml-1" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button variant="ghost" size="sm" onClick={() => toggleSort("days_since_last_order")} data-testid="sort-days-since">
                        Days Since Last <ArrowUpDown className="w-3 h-3 ml-1" />
                      </Button>
                    </TableHead>
                    <TableHead>Last Order</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((m) => {
                    const health = getHealthStatus(m);
                    const isSlowing = m.avg_days_between_orders !== null &&
                      m.days_since_last_order !== null &&
                      m.days_since_last_order > m.avg_days_between_orders * 1.5;
                    return (
                      <TableRow
                        key={m.company_id}
                        className={health === "inactive" ? "bg-red-50/50 dark:bg-red-950/10" : health === "at_risk" ? "bg-amber-50/50 dark:bg-amber-950/10" : ""}
                        data-testid={`row-customer-${m.company_id}`}
                      >
                        <TableCell>
                          <Link href={`/companies/${m.company_id}`} className="font-medium hover:underline text-sm" data-testid={`link-company-${m.company_id}`}>
                            {m.trading_name || m.legal_name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {m.client_grade ? (
                            <Badge variant={m.client_grade === "A" ? "default" : "secondary"} className="text-xs">
                              {m.client_grade}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={`text-xs ${
                              health === "inactive"
                                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                : health === "at_risk"
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            }`}
                            data-testid={`badge-status-${m.company_id}`}
                          >
                            {health === "inactive" ? "Inactive" : health === "at_risk" ? "At Risk" : "Healthy"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{m.total_orders}</TableCell>
                        <TableCell className="text-sm">{formatRevenue(m.total_revenue)}</TableCell>
                        <TableCell className="text-sm">
                          <span className="flex items-center gap-1">
                            {formatDays(m.avg_days_between_orders)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={`text-sm flex items-center gap-1 ${
                            health === "inactive" ? "text-red-600 font-semibold" :
                            health === "at_risk" ? "text-amber-600 font-medium" : ""
                          }`}>
                            {formatDays(m.days_since_last_order)}
                            {isSlowing && <TrendingDown className="w-3.5 h-3.5 text-amber-500" />}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(m.most_recent_order)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          {!isLoading && filtered.length > 0 && (
            <p className="text-xs text-muted-foreground mt-3">
              Showing {filtered.length} of {metrics.length} customers with orders
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
