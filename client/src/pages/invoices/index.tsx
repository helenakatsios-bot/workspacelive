import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { format } from "date-fns";
import { Receipt, MoreHorizontal, Eye, Edit, Building2, DollarSign, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { DateRangeFilter } from "@/components/date-range-filter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/lib/auth";
import type { Invoice, Company } from "@shared/schema";
import { Filter } from "lucide-react";

interface InvoiceWithCompany extends Invoice {
  company?: Company;
}

const statusOptions = [
  { value: "all", label: "All Status" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "void", label: "Void" },
];

export default function InvoicesPage() {
  const [, navigate] = useLocation();
  const { canEdit, canViewPricing } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [showFilters, setShowFilters] = useState(false);

  const { data: invoices, isLoading } = useQuery<InvoiceWithCompany[]>({
    queryKey: ["/api/invoices"],
  });

  const filteredInvoices = useMemo(() => {
    if (!invoices) return [];
    return invoices.filter((invoice) => {
      const matchesSearch =
        invoice.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
        (invoice.company?.tradingName || invoice.company?.legalName || "").toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || invoice.status === statusFilter;
      const issueDate = new Date(invoice.issueDate);
      const matchesStartDate = !startDate || issueDate >= startDate;
      const matchesEndDate = !endDate || issueDate <= endDate;
      return matchesSearch && matchesStatus && matchesStartDate && matchesEndDate;
    });
  }, [invoices, search, statusFilter, startDate, endDate]);

  const formatCurrency = (value: string | number) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
    }).format(num);
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
      sent: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
      paid: "bg-green-500/10 text-green-700 dark:text-green-400",
      overdue: "bg-red-500/10 text-red-700 dark:text-red-400",
      void: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
    };
    return colors[status] || colors.draft;
  };

  const overdueCount = useMemo(() => {
    return filteredInvoices.filter((i) => i.status === "overdue").length;
  }, [filteredInvoices]);

  const totalOutstanding = useMemo(() => {
    return filteredInvoices
      .filter((i) => i.status === "sent" || i.status === "overdue")
      .reduce((sum, i) => sum + parseFloat(i.balanceDue as string), 0);
  }, [filteredInvoices]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description="Manage customer invoices"
        searchPlaceholder="Search by invoice number or company..."
        searchValue={search}
        onSearchChange={setSearch}
        action={
          canEdit
            ? {
                label: "New Invoice",
                onClick: () => navigate("/invoices/new"),
                testId: "button-new-invoice",
              }
            : undefined
        }
      >
        <Button variant="outline" onClick={() => setShowFilters(!showFilters)} data-testid="button-toggle-filters">
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

      {canViewPricing && (overdueCount > 0 || totalOutstanding > 0) && (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          {overdueCount > 0 && (
            <Card className="border-destructive/50 bg-destructive/5">
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-destructive" />
                  </div>
                  <div>
                    <p className="font-medium text-destructive">{overdueCount} Overdue</p>
                    <p className="text-sm text-muted-foreground">Requires attention</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          {totalOutstanding > 0 && (
            <Card>
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{formatCurrency(totalOutstanding)}</p>
                    <p className="text-sm text-muted-foreground">Total outstanding</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
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
                </div>
              ))}
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="p-12 text-center">
              <Receipt className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="font-medium mb-1">No invoices found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {search || statusFilter !== "all" ? "Try adjusting your filters" : "Create your first invoice"}
              </p>
              {canEdit && !search && statusFilter === "all" && (
                <Button onClick={() => navigate("/invoices/new")} data-testid="button-first-invoice">
                  Create Invoice
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead className="hidden md:table-cell">Issue Date</TableHead>
                  <TableHead className="hidden lg:table-cell">Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  {canViewPricing && <TableHead className="text-right">Balance</TableHead>}
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.map((invoice) => (
                  <TableRow
                    key={invoice.id}
                    className="hover-elevate cursor-pointer"
                    onClick={() => navigate(`/invoices/${invoice.id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Receipt className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium" data-testid={`text-invoice-number-${invoice.id}`}>
                            {invoice.invoiceNumber}
                          </p>
                          <p className="text-xs text-muted-foreground md:hidden">
                            {format(new Date(invoice.issueDate), "MMM d, yyyy")}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        <span className="truncate max-w-[150px]">
                          {invoice.company?.tradingName || invoice.company?.legalName || "Unknown"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {format(new Date(invoice.issueDate), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {invoice.dueDate ? format(new Date(invoice.dueDate), "MMM d, yyyy") : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(invoice.status)}>{invoice.status}</Badge>
                    </TableCell>
                    {canViewPricing && (
                      <TableCell className="text-right font-medium">{formatCurrency(invoice.balanceDue)}</TableCell>
                    )}
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/invoices/${invoice.id}`}>
                              <Eye className="w-4 h-4 mr-2" />
                              View
                            </Link>
                          </DropdownMenuItem>
                          {canEdit && (
                            <DropdownMenuItem asChild>
                              <Link href={`/invoices/${invoice.id}/edit`}>
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
