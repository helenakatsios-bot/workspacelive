import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { format } from "date-fns";
import { ShoppingCart, MoreHorizontal, Eye, Edit, Download, Calendar, Building2, Filter } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { DateRangeFilter } from "@/components/date-range-filter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/lib/auth";
import type { Order, Company } from "@shared/schema";

interface OrderWithCompany extends Order {
  company?: Company;
}

const statusOptions = [
  { value: "all", label: "All Status" },
  { value: "new", label: "New" },
  { value: "confirmed", label: "Confirmed" },
  { value: "in_production", label: "In Production" },
  { value: "ready", label: "Ready" },
  { value: "dispatched", label: "Dispatched" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "on_hold", label: "On Hold" },
];

export default function OrdersPage() {
  const [, navigate] = useLocation();
  const [location] = useLocation();
  const { canEdit, canViewPricing } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.split("?")[1] || "");
    if (params.get("preset") === "since-july-2021") {
      setStartDate(new Date(2021, 6, 1));
      setEndDate(new Date());
      setShowFilters(true);
    }
  }, [location]);

  const { data: orders, isLoading } = useQuery<OrderWithCompany[]>({
    queryKey: ["/api/orders"],
  });

  const filteredOrders = useMemo(() => {
    if (!orders) return [];
    return orders.filter((order) => {
      const matchesSearch =
        order.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
        (order.company?.tradingName || order.company?.legalName || "").toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || order.status === statusFilter;
      const orderDate = new Date(order.orderDate);
      const matchesStartDate = !startDate || orderDate >= startDate;
      const matchesEndDate = !endDate || orderDate <= endDate;
      return matchesSearch && matchesStatus && matchesStartDate && matchesEndDate;
    });
  }, [orders, search, statusFilter, startDate, endDate]);

  const uniqueCompanies = useMemo(() => {
    const companyMap = new Map<string, Company>();
    filteredOrders.forEach((order) => {
      if (order.company && !companyMap.has(order.company.id)) {
        companyMap.set(order.company.id, order.company);
      }
    });
    return Array.from(companyMap.values());
  }, [filteredOrders]);

  const formatCurrency = (value: string | number) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
    }).format(num);
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      new: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
      confirmed: "bg-green-500/10 text-green-700 dark:text-green-400",
      in_production: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
      ready: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
      dispatched: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
      completed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
      cancelled: "bg-red-500/10 text-red-700 dark:text-red-400",
      on_hold: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
    };
    return colors[status] || colors.new;
  };

  const totalRevenue = useMemo(() => {
    return filteredOrders.reduce((sum, order) => sum + parseFloat(order.total as string), 0);
  }, [filteredOrders]);

  const handleExportClients = () => {
    const csvContent = [
      ["Company Name", "Legal Name", "ABN", "Payment Terms", "Credit Status"].join(","),
      ...uniqueCompanies.map((c) => [
        `"${c.tradingName || c.legalName}"`,
        `"${c.legalName}"`,
        c.abn || "",
        c.paymentTerms || "",
        c.creditStatus,
      ].join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clients-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        description="Manage customer orders and fulfillment"
        searchPlaceholder="Search by order number or company..."
        searchValue={search}
        onSearchChange={setSearch}
        action={
          canEdit
            ? {
                label: "New Order",
                onClick: () => navigate("/orders/new"),
                testId: "button-new-order",
              }
            : undefined
        }
      >
        <Button
          variant="outline"
          onClick={() => setShowFilters(!showFilters)}
          data-testid="button-toggle-filters"
        >
          <Filter className="w-4 h-4 mr-2" />
          Filters
        </Button>
      </PageHeader>

      <Collapsible open={showFilters} onOpenChange={setShowFilters}>
        <CollapsibleContent>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex-1 min-w-[200px]">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Date Range</label>
                  <DateRangeFilter
                    startDate={startDate}
                    endDate={endDate}
                    onStartDateChange={setStartDate}
                    onEndDateChange={setEndDate}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-40" data-testid="select-status-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {(startDate || endDate) && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="py-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">
                    {startDate && endDate
                      ? `Orders from ${format(startDate, "MMM d, yyyy")} to ${format(endDate, "MMM d, yyyy")}`
                      : startDate
                      ? `Orders since ${format(startDate, "MMM d, yyyy")}`
                      : `Orders until ${format(endDate!, "MMM d, yyyy")}`}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {filteredOrders.length} orders from {uniqueCompanies.length} companies
                    {canViewPricing && ` • ${formatCurrency(totalRevenue)} total`}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleExportClients} data-testid="button-export-clients">
                  <Download className="w-4 h-4 mr-2" />
                  Export Clients
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="w-10 h-10 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <Skeleton className="h-6 w-20" />
                </div>
              ))}
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="p-12 text-center">
              <ShoppingCart className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="font-medium mb-1">No orders found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {search || statusFilter !== "all" || startDate || endDate
                  ? "Try adjusting your filters"
                  : "Create your first order to get started"}
              </p>
              {canEdit && !search && statusFilter === "all" && !startDate && !endDate && (
                <Button onClick={() => navigate("/orders/new")} data-testid="button-first-order">
                  Create Order
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead className="hidden md:table-cell">Order Date</TableHead>
                  <TableHead>Status</TableHead>
                  {canViewPricing && <TableHead className="hidden lg:table-cell text-right">Total</TableHead>}
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order) => (
                  <TableRow
                    key={order.id}
                    className="hover-elevate cursor-pointer"
                    onClick={() => navigate(`/orders/${order.id}`)}
                    data-testid={`row-order-${order.id}`}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <ShoppingCart className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium" data-testid={`text-order-number-${order.id}`}>
                            {order.orderNumber.replace(/^PD-/, '')}
                          </p>
                          <p className="text-xs text-muted-foreground md:hidden">
                            {format(new Date(order.orderDate), "MMM d, yyyy")}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        <span className="truncate max-w-[150px]">
                          {order.company?.tradingName || order.company?.legalName || "Unknown"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {format(new Date(order.orderDate), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(order.status)}>
                        {order.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    {canViewPricing && (
                      <TableCell className="hidden lg:table-cell text-right font-medium">
                        {formatCurrency(order.total)}
                      </TableCell>
                    )}
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" data-testid={`button-order-menu-${order.id}`}>
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/orders/${order.id}`}>
                              <Eye className="w-4 h-4 mr-2" />
                              View Details
                            </Link>
                          </DropdownMenuItem>
                          {canEdit && (
                            <DropdownMenuItem asChild>
                              <Link href={`/orders/${order.id}/edit`}>
                                <Edit className="w-4 h-4 mr-2" />
                                Edit
                              </Link>
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
